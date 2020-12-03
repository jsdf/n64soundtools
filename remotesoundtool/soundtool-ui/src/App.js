import React, {useState, useEffect, useLayoutEffect, useRef} from 'react';
import './App.css';

import io from 'socket.io-client';
const Player = require('./player');

var searchParams = new URLSearchParams(window.location.search);

if (!searchParams.has('port')) {
  window.alert(`'port' url query param required`);
  throw new Error(`'port' url query param required`);
}

const socketPort = parseInt(searchParams.get('port'));

// a synchronously inspectable promise wrapper
class Future {
  state = 'pending';
  value = null;
  error = null;

  constructor(promise) {
    this.promise = promise;
    promise
      .then((value) => {
        this.state = 'fulfilled';
        this.value = value;
      })
      .catch((err) => {
        this.state = 'rejected';
        this.error = err;
      });
  }
}

class RequestCache {
  items = new Map();

  get(url, makeRequest) {
    if (!this.items.has(url)) {
      this.items.set(url, new Future(makeRequest(url)));
    }

    return this.items.get(url);
  }
}

const requestCache = new RequestCache();

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

async function getMidiOutPort() {
  const midiAccess = await navigator.requestMIDIAccess();
  const out = [...midiAccess.outputs.values()].find(
    (out) => out.name === 'IAC Driver WebMidi'
  );
  return out;
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

  useEffect(() => {
    async function run() {
      const midiFile = await fetch('/b1n12ft.mid').then((res) =>
        res.arrayBuffer()
      );
      const outPort = await getMidiOutPort();

      const player = new Player(midiFile);

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
        });
      }
      tick();

      // player.on('pendingEvents', (events) => {});
      console.log('playing');
      player.play();
    }

    run();
  }, []);

  if (!state) {
    return <div style={{margin: 100}}>awaiting initial state...</div>;
  }

  const api = apiRef.current;

  return (
    <div>
      <div style={{backgroundColor: 'red', color: 'white'}}>
        {clientErrors.concat(state.serverErrors).map(({message, error}, i) => (
          <div key={i}>{message}</div>
        ))}
      </div>
      <div style={{display: 'flex'}}>
        <div className="pane-log">
          <h2>log</h2>
          <Log logItems={logItems} />
        </div>
      </div>
      <details>
        <summary>state</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </details>
    </div>
  );
}

export default App;
