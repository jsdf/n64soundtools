const {Midi} = require('@tonejs/midi');
var parseMidi = require('midi-file').parseMidi;
var writeMidi = require('midi-file').writeMidi;

// midicvt takes an input midi file and filters out a bunch of unneeded event types,
// saving the output as a (Type 0 MIDI) .seq file
// todo: implement
const fs = require('fs');

const arg = require('arg');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>
  '--blank': Boolean,

  // Aliases
  '-o': '--out',
});

const midiBuffer = fs.readFileSync(args._[0]);

// console.log(new Midi(midiBuffer));

// const midi = new Midi(midiBuffer);
const midi = parseMidi(midiBuffer);

const acceptableEvents = new Set([
  'noteOn',
  'noteOff',
  'controller',
  // 'timeSignature',
]);

midi.tracks[0] = midi.tracks[0].filter((ev) => acceptableEvents.has(ev.type));

if (args['--blank']) {
  midi.tracks = [[]];
}

// midi.tracks.map((track) => {
//   return track.filter((ev) => acceptableEvents.has(ev.type));
// });

const outputBuffer = Buffer.from(writeMidi(midi));

// console.log(new Midi(outputBuffer));

fs.writeFileSync(args['--out'] || 'tst.seq', outputBuffer);
