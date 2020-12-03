const fs = require('fs');
const {performance} = require('perf_hooks');

global.performance = performance;

const DEV = process.env.NODE_ENV === 'development';

const arg = require('arg');

const args = arg({
  // Types
  '--help': Boolean,
  '--midiin': String, // --midiin <string> or --midiin=<string>
  '--midiout': String, // --midiout <string> or --midiout=<string>
  '--channelfilter': String, // --channelfilter 2 or --channelfilter="1, 3, 4"
});

let player;
let realtime = false;
let channelFilter = null;

if (args['--channelfilter']) {
  channelFilter = new Set(
    args['--channelfilter'].split(',').map((v) => parseInt(v, 10))
  );
}
async function run() {
  if (args._[0]) {
    const Player = require('./soundtool-ui/src/player');
    const midiData = await fs.promises.readFile(args._[0]);
    player = new Player(midiData, channelFilter);
  } else if (args['--midiin']) {
    if (args['--channelfilter']) {
      throw new Error('--channelfilter not supported with --midiout');
    }
    realtime = true;
    const Player = require('./soundtool-ui/src/rtplayer');
    const inPort = await getMidiPort(args['--midiin'], 'in');
    player = new Player(inPort);
  } else {
    throw new Error('--midiin or positional arg required');
  }

  if (args['--midiout']) {
    runWithMidiOut(args['--midiout']);
  } else {
    runWithEverdriveOut();
  }
}

const eventLog = [];

async function runWithEverdriveOut() {
  const DebuggerInterface = DEV
    ? require('../../ed64logjs/dbgif')
    : require('ed64logjs/dbgif');
  const dbgif = new DebuggerInterface();
  await dbgif.start();

  console.log('dbgif started');
  if (!DEV) {
    // in dev this is built in
    dbgif.on('log', (line) => {
      process.stdout.write(line + '\n');
    });
  }

  function sendPendingEvents(events) {
    // play to n64
    const midiMessageSize = 4 + 4;
    const remainingSpace = 512 - 8;
    const maxEventsInPacket = Math.floor(remainingSpace / midiMessageSize);
    const eventMessagesTruncated = events
      .slice(0, maxEventsInPacket)
      .map((event) => {
        const midiMessage = Buffer.alloc(midiMessageSize);
        midiMessage.writeUInt32BE(event.time * 1000);
        event.data.copy(midiMessage, /*offset to midi bytes*/ 4);
        return midiMessage;
      });

    const headerEventCount = Buffer.alloc(4);
    headerEventCount.writeUInt32BE(eventMessagesTruncated.length);
    const packetHeader = Buffer.concat([
      Buffer.from('MMID', 'utf8'),
      headerEventCount,
    ]);
    const packet = Buffer.concat([packetHeader, ...eventMessagesTruncated]);
    if (packet.length > 512) {
      throw new Error(`invalid packet size ${packet.length}`);
    }
    console.log('messages', eventMessagesTruncated);
    console.log('sendPacket', packet);
    dbgif.sendPacket(packet);

    // return any leftover events which didn't fit in this packet
    return events.slice(maxEventsInPacket);
  }

  let eventsToSend = [];
  function tick() {
    const lookAhead = 32;
    setTimeout(() => {
      eventsToSend = eventsToSend.concat(player.getPendingEvents(lookAhead));
      if (eventsToSend.length) {
        eventsToSend = sendPendingEvents(eventsToSend);
      }
      if (player.playing) {
        tick();
      }
    }, 1000 / 60);
  }

  console.log('playing to n64');
  dbgif.sendPacket(Buffer.from('MSTA', 'utf8'));
  player.play();
  tick();
}

async function runWithMidiOut(portName) {
  const outPort = await getMidiPort(args['--midiout'], 'out');

  function playPendingEvents(events) {
    events.forEach((event) => {
      const midiMessage = Array.from(event.data);

      outPort.send(midiMessage);
    });
  }

  function tick() {
    const start = performance.now();
    setTimeout(() => {
      // eventLog.push({time: performance.now() - start});
      const events = player.getPendingEvents(0);
      playPendingEvents(events);
      tick();
    });
  }
  tick();

  console.log('playing to midi out');
  player.play();
}

async function getMidiPort(name, direction) {
  var navigator = require('jzz');

  const midiAccess = await navigator.requestMIDIAccess();

  const ports = [
    ...midiAccess[direction == 'in' ? 'inputs' : 'outputs'].values(),
  ];

  const port =
    ports.find((port) => port.name.toLowerCase() === name.toLowerCase()) ||
    ports.find((port) => port.name.toLowerCase().includes(name.toLowerCase()));

  if (!port) {
    throw new Error(`no port found matching "${name}"`);
  }
  // port.open();
  return port;
}

process.on('SIGINT', function () {
  eventLog.forEach((event, index) => {
    console.log(event);
  });
  process.exit(0);
});

run();
