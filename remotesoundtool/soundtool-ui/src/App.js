import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import './App.css';
import Details from './Details';
import {Midi} from '@tonejs/midi';
import MidiTrackEditor from './MidiTrackEditor';
import SelectWithLabel from './SelectWithLabel';
import useStateWithUndoHistory from './useStateWithUndoHistory';

import io from 'socket.io-client';
const Player = require('./player');

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

  parsed.tracks.forEach((track) => {
    track.notes.forEach((note, index) => {
      note.id = index;
    });
  });
  return parsed;
}

function MidiPortSelector({direction, port, onChange}) {
  const [ports, setPorts] = useState([]);
  const mountedRef = useRef(false);
  const midiAccessRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    function onStateChange() {
      if (mountedRef.current && midiAccessRef.current) {
        setPorts(
          midiAccessRef.current[direction === 'in' ? 'inputs' : 'outputs']
        );
        if (
          !midiAccessRef.current[direction === 'in' ? 'inputs' : 'outputs'].get(
            port?.id
          )
        ) {
          onChange(null);
        }
      }
    }

    navigator.requestMIDIAccess().then((midiAccess) => {
      midiAccessRef.current = midiAccess;
      midiAccess.addEventListener('statechange', onStateChange);
      if (mountedRef.current) {
        const initialPorts =
          midiAccess[direction === 'in' ? 'inputs' : 'outputs'];
        setPorts(initialPorts);
        const ports = [...initialPorts.values()];
        if (ports.length) {
          onChange(ports[0]);
        }
      }
    });

    return () => {
      mountedRef.current = false;
      if (midiAccessRef.current) {
        midiAccessRef.current.removeEventListener('statechange', onStateChange);
      }
    };
  }, []);

  return (
    <SelectWithLabel
      label="Midi Out"
      options={[...ports.values()].map((v) => ({value: v.id, label: v.name}))}
      value={port?.id}
      onChange={(id) => onChange(ports.get(id))}
    />
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

function App() {
  const [state, setState] = useState(null);
  const [clientErrors, setClientErrors] = useState([]);
  const [logItems, setLogItems] = useState([]);

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
    socket.on('disconnect', () => {
      console.log('got disconnect message');
      setClientErrors((prev) =>
        prev.concat({
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

    apiRef.current = {
      sendCommand(cmd, data) {
        socket.emit('cmd', {cmd, data});
      },
    };
  }, []);

  const historyRef = useRef([]);
  const [
    midiState,
    setMidiStateWithUndo,
    midiStateHistory,
  ] = useStateWithUndoHistory(null, {
    // prevent undoing back to null state
    validateHistoryChange: (state) => state != null,
  });
  const [outPort, setOutPort] = useState(null);
  const playerAPIRef = useRef(null);

  useEffect(() => {
    if (!midiState) return;
    if (!outPort) return;
    const player = new Player(midiState);

    window.eventLog = [];

    function tick() {
      setTimeout(() => {
        const now = performance.now();
        const events = player.getPendingEvents(16);

        events.forEach((event) => {
          const midiMessage = Array.from(event.data);
          const prevEvent = window.eventLog[window.eventLog.length - 1];
          window.eventLog.push({
            scheduleDelta: player.startTime + event.time - now,
            sincePrevEvent: prevEvent ? prevEvent.time - event.time : null,
            ...event,
          });
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

  useEffect(() => {
    async function run() {
      const midiFile = await fetch('/b1n12ft.mid').then((res) =>
        res.arrayBuffer()
      );
      setMidiStateWithUndo(initMidiFromData(midiFile), {updateType: 'commit'});
    }

    run();
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

  console.log('rerender');

  return (
    <div>
      <div style={{backgroundColor: 'red', color: 'white'}}>
        {clientErrors.concat(state.serverErrors).map(({message, error}, i) => (
          <div key={i}>{message}</div>
        ))}
      </div>
      <div>
        <MidiPortSelector
          direction="out"
          port={outPort}
          onChange={setOutPort}
        />
      </div>
      <div style={{position: 'relative'}}>
        {midiState
          ? midiState.tracks.map((track, i) => (
              <div key={i}>
                inst: {track.instrument.number}
                <MidiTrackEditor
                  events={track.notes}
                  setEvents={(updater, updateType) =>
                    setEventsForTrack(updater, i, updateType)
                  }
                />
              </div>
            ))
          : 'select midi file'}
      </div>

      <Details summary="Log" startOpen={true}>
        <Log logItems={logItems} />
      </Details>
      <Details summary="State">
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </Details>
    </div>
  );
}

export default App;
