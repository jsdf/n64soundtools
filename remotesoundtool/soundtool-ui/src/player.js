const renderMIDIStream = require('./renderMIDIStream');

class Player {
  playing = false;
  startTime = 0;
  timeWindowLookahead = 0;
  _nextEvent = 0;

  constructor(midi, channelFilter, generalMIDI) {
    this.events = renderMIDIStream(midi, channelFilter, generalMIDI);
  }

  getPendingEvents(timeWindow) {
    const time = performance.now() - this.startTime;

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
