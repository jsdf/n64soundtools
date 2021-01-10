import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import io from 'socket.io-client';
import {Midi} from '@tonejs/midi';

import './App.css';
import Details from './Details';
import MidiTrackEditor from './MidiTrackEditor';
import MidiTracksView from './MidiTracksView';
import MidiPortSelector from './MidiPortSelector';
import useStateWithUndoHistory from './useStateWithUndoHistory';
import SplitPane from './SplitPane';
import ResponsiveBlock from './ResponsiveBlock';
import throttleTrailing from './throttleTrailing';
import Player from './player';
import RequestMap from './RequestMap';
import * as webAudio from './webAudio';
import {Keyboard} from './keyboard';
import useRefOnce from './flatland/useRefOnce';

var searchParams = new URLSearchParams(window.location.search);

const socketPort = parseInt(
  searchParams.get('port') || parseInt(window.location.port)
);

if (!socketPort) {
  window.alert(`'port' url query param required`);
  throw new Error(`'port' url query param required`);
}

function useKeyboardCommands(commands) {
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    const isMac = navigator.platform.startsWith('Mac');
    function onKeyDown(e) {
      const matching = commandsRef.current.find(
        (cmd) =>
          e.key.toLowerCase() === cmd.key.toLowerCase() &&
          (isMac
            ? e.metaKey === Boolean(cmd.cmdCtrl)
            : e.ctrlKey === Boolean(cmd.cmdCtrl)) &&
          e.shiftKey === Boolean(cmd.shift) &&
          e.altKey === Boolean(cmd.alt)
      );

      if (matching) matching.exec(e);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

function initMidiFromData(midiData) {
  const parsed = new Midi(midiData).toJSON();

  parsed.fileID = Math.random(); // so we can track when a new file is loaded
  parsed.tracks.forEach((track) => {
    track.notes.forEach((note, index) => {
      note.id = index;
    });
  });
  return parsed;
}

function loadMidiStateFromLocalStorage() {
  try {
    return JSON.parse(window.localStorage.getItem('midistate'));
  } catch (err) {
    console.error(err);
    return null;
  }
}

const storeMidiStateToLocalStorage = throttleTrailing((midiState) => {
  try {
    window.localStorage.setItem('midistate', JSON.stringify(midiState));
  } catch (err) {
    console.error('failed to store midiState', midiState);
  }
}, 500);

  );
}

function Log({logItems}) {
  const logEl = useRef(null);

  useLayoutEffect(() => {
    logEl.current.scrollTop = logEl.current.scrollHeight;
  }, [logItems]);

  return (
    <div style={{overflowY: 'scroll', height: 400}} ref={logEl}>
      {logItems.map((logItem, i) => (
        <div key={i}>{logItem}</div>
      ))}
    </div>
  );
}

const styles = {
  control: {
    margin: 16,
  },
};

function App() {
  const [state, setState] = useState(null);
  const [clientErrors, setClientErrors] = useState([]);
  const [logItems, setLogItems] = useState([]);
  const [selectedTrackIndex, setSelectedTrackIndex] = useState(0);

  let apiRef = useRef(null);

  useEffect(() => {
    const socket = io.connect(`http://localhost:${socketPort}`);
    socket.on('state', (newState) => {
      console.log(newState);
      setState(newState);
    });
    socket.on('log', (newLogItem) => {
      setLogItems((logItems) => logItems.concat(newLogItem));
    });
    socket.on('connect', () => {
      setClientErrors((prev) =>
        prev.filter(
          (error) =>
            error.message !== 'disconnected' &&
            error.message !== 'connect_error'
        )
      );
    });
    socket.on('connect_error', (error) => {
      setClientErrors((prev) =>
        prev
          .filter((error) => error.message !== 'connect_error')
          .concat({
            message: 'connect_error',
            error: error,
          })
      );
    });

    socket.on('disconnect', () => {
      console.log('got disconnect message');
      setClientErrors((prev) =>
        prev
          .filter((error) => error.message !== 'disconnected')
          .concat({
            message: 'disconnected',
            error: null,
          })
      );
    });
    socket.on('error', (error) => {
      console.log('got error message', error);
      setClientErrors((prev) =>
        prev.concat({
          message: 'io error',
          error: error,
        })
      );
    });

    // a promise-based request/response abstraction on top of messages
    const requestMap = new RequestMap();
    socket.on('cmd', ({cmd, data, error, requestID}) => {
      if (requestID != null) {
        requestMap.handleResponse(
          requestID,
          error != null ? error : data,
          error != null
        );
        return;
      }

      switch (cmd) {
        default:
          console.error('unknown command', cmd);
          return;
      }
    });

    apiRef.current = {
      sendCommand(cmd, data) {
        socket.emit('cmd', {cmd, data});
      },
      sendRequest(cmd, data) {
        const requestID = cmd + String(Math.random());

        const promise = requestMap.handleRequest(requestID);
        socket.emit('cmd', {cmd, data, requestID});
        promise.catch((err) => {
          console.error(err);
        });
        return promise;
      },
    };
  }, []);

  const [
    midiState,
    setMidiStateWithUndo,
    midiStateHistory,
  ] = useStateWithUndoHistory(loadMidiStateFromLocalStorage, {
    // prevent undoing back to null state
    validateHistoryChange: (state) => state != null,
  });

  const [instrumentBank, setInstrumentBank] = useState(null);

  useEffect(() => {
    storeMidiStateToLocalStorage(midiState);
  }, [midiState]);

  const [outPort, setOutPort] = useState(null);
  const playerAPIRef = useRef(null);

  const webAudioPlayerRef = useRefOnce(() => {
    webAudio.makeSampler();
    return webAudio.makePlayer();
  });
  const extraMidiPorts = useMemo(() => [webAudioPlayerRef.current.midiOut], [
    webAudioPlayerRef,
  ]);

  useEffect(() => {
    if (!midiState) return;
    if (!outPort) return;
    const player = new Player(midiState);

    function tick() {
      setTimeout(() => {
        const events = player.getPendingEvents(16);

        events.forEach((event) => {
          const midiMessage = Array.from(event.data);
          outPort.send(midiMessage, player.startTime + event.time);
        });
        if (player.playing) {
          tick();
        }
      }, 1);
    }

    const playerAPI = {
      play: () => {
        console.log('playing');
        tick();
        player.play();
      },
      stop: () => player.stop(),
    };

    playerAPIRef.current = playerAPI;

    return () => {
      playerAPI.stop();
    };
  }, [midiState, outPort]);

  const pickMidiFile = useCallback(() => {
    apiRef.current
      .sendRequest('showOpenDialog', {
        properties: ['openFile'],
        filters: [{name: 'MIDI Files', extensions: ['mid']}],
      })
      .then((result) => {
        const midiFile = result.files[0];
        if (midiFile) {
          setMidiStateWithUndo(initMidiFromData(midiFile.contents), {
            updateType: 'commit',
          });
        } else {
          console.warn('no file was selected');
        }
      });
  }, [setMidiStateWithUndo]);

  const pickInstrumentFile = useCallback(() => {
    apiRef.current
      .sendRequest('showInstrumentDialog')
      .then((instrumentBank) => {
        console.log(instrumentBank);
      });
  }, [setMidiStateWithUndo]);

  const setEventsForTrack = useCallback(
    (updater, thisTrackIdx, updateType) => {
      setMidiStateWithUndo(
        (s) => {
          return {
            ...s,
            tracks: s.tracks.map((track, trackIdx) => {
              const updatedNotes =
                typeof updater === 'function' ? updater(track.notes) : updater;
              if (trackIdx === thisTrackIdx) {
                return {...track, notes: updatedNotes};
              }
              return track;
            }),
          };
        },
        {updateType}
      );
    },
    [setMidiStateWithUndo]
  );

  useKeyboardCommands(
    useMemo(
      () => [
        {
          key: 'z',
          cmdCtrl: true,
          exec() {
            midiStateHistory.undo();
          },
        },
        {
          key: 'z',
          cmdCtrl: true,
          shift: true,
          exec() {
            midiStateHistory.redo();
          },
        },
        {
          key: 'y',
          cmdCtrl: true,
          exec() {
            midiStateHistory.redo();
          },
        },
      ],
      [midiStateHistory]
    )
  );

  if (!state) {
    return <div style={{margin: 100}}>awaiting initial state...</div>;
  }
  const selectedTrack = midiState ? midiState.tracks[selectedTrackIndex] : null;

  return (
    <div style={{display: 'flex', flexDirection: 'column', height: '100vh'}}>
      <div style={{backgroundColor: 'red', color: 'white', flex: 0}}>
        {clientErrors.concat(state.serverErrors).map(({message, error}, i) => (
          <div key={i}>{message}</div>
        ))}
      </div>
      <div style={{flex: 0, display: 'flex', flexDirection: 'row'}}>
        <div style={{...styles.control}}>
          <MidiPortSelector
            direction="out"
            port={outPort}
            onChange={setOutPort}
            extraPorts={extraMidiPorts}
          />
        </div>
        <div style={{...styles.control}}>
          <button onClick={pickMidiFile}>Open midi file...</button>
          <button onClick={pickInstrumentFile}>Open instrument file...</button>
        </div>
        <div style={{...styles.control}}>
          <Keyboard instrument={outPort} />
          <button
            onClick={() => {
              // webAudioPlayerRef.current.play(midiState).catch((err) => {
              //   console.error(err);
              //   debugger;
              // });
              playerAPIRef.current.play();
            }}
          >
            &#9658;
          </button>
          <button
            onClick={() => {
              playerAPIRef.current.stop();
              // webAudioPlayerRef.current.stop();
            }}
          >
            &#9632;
          </button>
        </div>
      </div>
      <div style={{flex: 1, overflow: 'hidden'}}>
        <ResponsiveBlock style={{height: '100%', overflow: 'hidden'}}>
          {(dimensions) => {
            return (
              <div style={{position: 'relative', ...dimensions}}>
                {midiState ? (
                  dimensions && (
                    <>
                      <SplitPane
                        height={dimensions.height}
                        minHeight={dimensions.height / 4}
                        styleTop={{
                          overflow: 'hidden',
                        }}
                        styleBottom={{
                          overflow: 'hidden',
                        }}
                        top={
                          <div
                            style={{
                              height: '100%',
                              border: 'solid 1px black',
                              overflow: 'auto',
                              backgroundColor: '#555',
                            }}
                          >
                            <MidiTracksView
                              key={`${midiState.fileID}`}
                              tracks={midiState.tracks}
                              selectedTrackIndex={selectedTrackIndex}
                              setSelectedTrackIndex={setSelectedTrackIndex}
                            />
                          </div>
                        }
                        bottom={
                          <div
                            style={{
                              height: '100%',
                              border: 'solid 1px black',
                              backgroundColor: '#555',
                            }}
                          >
                            <ResponsiveBlock
                              style={{height: '100%', overflow: 'hidden'}}
                            >
                              {(dimensions) =>
                                !dimensions ? null : (
                                  <MidiTrackEditor
                                    key={`${midiState.fileID}_${selectedTrackIndex}`}
                                    {...dimensions}
                                    events={selectedTrack.notes}
                                    setEvents={(updater, updateType) =>
                                      setEventsForTrack(
                                        updater,
                                        selectedTrackIndex,
                                        updateType
                                      )
                                    }
                                  />
                                )
                              }
                            </ResponsiveBlock>
                          </div>
                        }
                      />
                    </>
                  )
                ) : (
                  <div style={{flex: 0, ...styles.control}}>
                    Open a midi file to get started
                  </div>
                )}
              </div>
            );
          }}
        </ResponsiveBlock>
      </div>

      {false && (
        <div style={{display: 'none'}}>
          <Details summary="Log" startOpen={true}>
            <Log logItems={logItems} />
          </Details>
          <Details summary="State">
            <pre>{JSON.stringify(state, null, 2)}</pre>
          </Details>
        </div>
      )}
    </div>
  );
}

export default App;
