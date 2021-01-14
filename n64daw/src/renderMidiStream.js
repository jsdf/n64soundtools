const {midiCCs, midiCCsByName} = require('./midicc');

const allowedCCs = new Set([
  'bankselectcoarse',
  'modulationwheelcoarse',
  'breathcontrollercoarse',
  'footcontrollercoarse',
  'portamentotimecoarse',
  'volumecoarse',
  'balancecoarse',
  'pancoarse',
  'expressioncoarse',
  'effectcontrol1coarse',
  'effectcontrol2coarse',
  'bankselectfine',
  'modulationwheelfine',
  'breathcontrollerfine',
  'footcontrollerfine',
  'portamentotimefine',
  'dataentryfine',
  'volumefine',
  'balancefine',
  'panfine',
  'expressionfine',
  'effectcontrol1fine',
  'effectcontrol2fine',
  'holdpedal',
  'portamento',
  'sustenutopedal',
  'softpedal',
  'legatopedal',
  'hold2pedal',
  'soundvariation',
  'resonance',
  'soundreleasetime',
  'soundattacktime',
  'brightness',
  'reverblevel',
  'tremololevel',
  'choruslevel',
  'celestelevel',
  'phaserlevel',
]);

function renderMIDIStream(midi, channelFilter, generalMIDI) {
  const events = [];
  midi.tracks.forEach((track) => {
    if (channelFilter && !channelFilter.has(track.channel)) return;
    if (!(generalMIDI && track.channel === 9)) {
      events.push({
        time: Math.floor(Math.random() * 1000),
        type: 'programChange',
        program: track.instrument.number,
        data: Buffer.from([0xc0 | track.channel, track.instrument.number | 0]),
      });
    }

    track.notes.forEach((noteEvent) => {
      events.push({
        time: 1000 * noteEvent.time,
        type: 'noteOn',
        noteEvent,
        velocity: (noteEvent.velocity * 0x7f) | 0,
        data: Buffer.from([
          0x90 | track.channel,
          noteEvent.midi,
          (noteEvent.velocity * 0x7f) | 0,
        ]),
      });
      events.push({
        time: 1000 * (noteEvent.time + noteEvent.duration),
        type: 'noteOff',
        noteEvent,
        velocity: (noteEvent.noteOffVelocity * 0x7f) | 0,
        data: Buffer.from([
          0x80 | track.channel,
          noteEvent.midi,
          (noteEvent.noteOffVelocity * 0x7f) | 0,
        ]),
      });
    });

    Object.values(track.controlChanges).forEach((ccEventArray, key) => {
      if (!allowedCCs.has(midiCCs[key])) {
        return;
      }
      ccEventArray.forEach((ccEvent) => {
        events.push({
          time: 1000 * (isNaN(ccEvent.time) ? 0 : ccEvent.time),
          type: 'controlChange',
          ccNumber: ccEvent.number,
          ccType: midiCCs[ccEvent.number],
          ccEvent,
          ccValue: (ccEvent.value * 0x7f) | 0,
          data: Buffer.from([
            0xb0 | track.channel,
            ccEvent.number,
            (ccEvent.value * 0x7f) | 0,
          ]),
        });
      });
    });
  });

  const sortOrder = {
    controlChange: 0,
    noteOff: 1,
    noteOn: 2,
  };
  events.sort((a, b) => {
    if (a.time === b.time) {
      return sortOrder[a.type] - sortOrder[b.type];
    }

    return a.time - b.time;
  });

  return events;
}

module.exports = renderMIDIStream;
