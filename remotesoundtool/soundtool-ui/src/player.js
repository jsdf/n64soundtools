const {Midi} = require('@tonejs/midi');

const {midiCCs} = require('./midicc');

class Player {
  playing = false;
  startTime = 0;
  timeWindowLookahead = 0;
  _nextEvent = 0;
  constructor(midiData, channelFilter) {
    const midi = new Midi(midiData);
    this.events = this._renderMIDIStream(midi, channelFilter);
    // console.log(this.events);
  }
  _renderMIDIStream(midi, channelFilter) {
    const events = [];
    midi.tracks.forEach((track) => {
      // if (channelFilter && !channelFilter.has(track.channel)) return;
      console.log(
        'channel',
        track.channel,
        'instrument',
        track.instrument,
        'name',
        track.name
      );
      if (track.channel !== 9) {
        events.push({
          time: Math.floor(Math.random() * 1000),
          type: 'programChange',
          program: track.instrument.number,
          data: Buffer.from([
            0xc0 | track.channel,
            track.instrument.number | 0,
            0,
          ]),
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

  getPendingEvents(timeWindow) {
    const time = performance.now() - this.startTime;

    // console.log('getting pending evnts at', time);

    const eventsToSend = [];

    while (
      this.events[this._nextEvent] &&
      this.events[this._nextEvent].time <
        time + (timeWindow + this.timeWindowLookahead)
    ) {
      eventsToSend.push(this.events[this._nextEvent]);
      this._nextEvent++;
    }

    if (this.events[this._nextEvent] == null) {
      console.log('stopping');
      this.stop();
    }
    return eventsToSend;
  }

  play() {
    this.startTime = performance.now();
    this.playing = true;
  }

  stop() {
    this.playing = false;
  }
}

module.exports = Player;
