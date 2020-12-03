const fs = require('fs');
const {performance} = require('perf_hooks');
const {MidiMessage} = require('midi-message-parser');

global.performance = performance;

const DEV = process.env.NODE_ENV === 'development';

const arg = require('arg');

const args = arg({
  // Types
  '--help': Boolean,
  '--midiin': String, // --midiin <string> or --midiin=<string>
  '--midiout': String, // --midiout <string> or --midiout=<string>
});

let player;
async function run() {
  if (args['--midiin']) {
    const inPort = await getMidiPort(args['--midiin'], 'in');
    console.log(inPort);
    inPort.onmidimessage = (midiMessage) => {
      try {
        console.log(midiMessage.receivedTime, Buffer.from(midiMessage.data));
      } catch (err) {
        console.error(err);
      }
    };
  }

  if (args['--midiout']) {
    const outPort = await getMidiPort(args['--midiout'], 'out');
    console.log(outPort);
    outPort.onmidimessage = (midiMessage) => {
      try {
        console.log(midiMessage.receivedTime, Buffer.from(midiMessage.data));
      } catch (err) {
        console.error(err);
      }
    };
  }
}

const eventLog = [];

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
