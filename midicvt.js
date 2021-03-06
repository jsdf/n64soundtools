#!/usr/bin/env node

// midicvt takes an input midi file and filters out a bunch of unneeded event types,
// saving the output as a (Type 0 MIDI) .seq file
// TODO: finish implementing deltaTime calculation for track

var parseMidi = require('midi-file').parseMidi;
var writeMidi = require('midi-file').writeMidi;

const fs = require('fs');

const arg = require('arg');

const args = arg({
  // Types
  '--help': Boolean,
  '--out': String, // --name <string> or --name=<string>
  '--blank': Boolean, // output file with no events
  '--gm': Boolean, // format file to correctly play as general midi
  '--channelfilter': String, // --channelfilter 2 or --channelfilter="1, 3, 4"

  // Aliases
  '-o': '--out',
  '-h': '--help',
});

if (args['--help']) {
  console.log(`midicvt [-v] [-s] <input file> <output file>`);
  process.exit(0);
}

const midiBuffer = fs.readFileSync(args._[0]);

let channelFilter = null;

if (args['--channelfilter']) {
  channelFilter = new Set(
    args['--channelfilter'].split(',').map((v) => parseInt(v, 10))
  );
}

const midi = parseMidi(midiBuffer);
// console.log(midi.tracks[0]);

const allowedCCs = new Set([
  0,
  1,
  2,
  4,
  5,
  7,
  8,
  10,
  11,
  12,
  13,
  32,
  33,
  34,
  36,
  37,
  38,
  39,
  40,
  42,
  43,
  44,
  45,
  64,
  65,
  66,
  67,
  68,
  69,
  70,
  71,
  72,
  73,
  74,
  91,
  92,
  93,
  94,
  95,
]);

const acceptableEvents = new Set([
  'noteOn',
  'noteOff',
  'controller',
  'programChange',
  'setTempo',
  'timeSignature',
]);

if (args['--blank']) {
  midi.tracks = [];
} else {
  const events = [];
  midi.tracks.map((track) => {
    let lastEventAbsTime = 0;
    track.forEach((ev) => {
      const absoluteTime = ev.deltaTime + lastEventAbsTime;
      ev.absoluteTime = absoluteTime;
      lastEventAbsTime = absoluteTime;
      if (!acceptableEvents.has(ev.type)) {
        return;
      }

      if (args['--gm'] && ev.channel === 9) {
        return;
      }

      if (
        channelFilter &&
        ev.channel != null &&
        channelFilter.has(ev.channel)
      ) {
        return;
      }

      if (ev.type === 'controller' && !allowedCCs.has(ev.controllerType)) {
        return;
      }

      events.push(ev);
    });
  });

  // fix delta times based on track-merged events absolute times
  events.sort((a, b) => a.absoluteTime - b.absoluteTime);
  let lastEventTime = 0;
  events.forEach((ev) => {
    const deltaTime = ev.absoluteTime - lastEventTime;
    lastEventTime = ev.absoluteTime;
    ev.deltaTime = deltaTime;
  });

  events.push({deltaTime: 0, meta: true, type: 'endOfTrack'});
  midi.tracks = [events];
}

const outputBuffer = Buffer.from(writeMidi(midi));
// console.log('output', parseMidi(outputBuffer));

fs.writeFileSync(args['--out'] || 'tst.seq', outputBuffer);
