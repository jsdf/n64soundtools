const renderMidiStream = require('./renderMidiStream');

class Player {
  playing = false;
  startTime = 0;
  stoppedAt = 0;
  tempoChanges = [];
  timeWindowLookahead = 0;
  _nextEvent = 0;
  _subscribers = [];

  constructor(midi, channelFilter, generalMIDI) {
    if (midi.header.tempos && midi.header.tempos.length) {
      let lastTempo = 120;
      let lastTime = 0;
      let lastTicks = 0;
      let lastQuarters = 0;
      midi.header.tempos.forEach((tempoCh) => {
        const deltaTicks = tempoCh.ticks - lastTicks;
        const quarters = deltaTicks / midi.header.ppq;
        const quarterMS = 60000 / lastTempo;
        lastTime = quarters * quarterMS;
        lastTicks = tempoCh.ticks;
        lastTempo = tempoCh.bpm;
        lastQuarters = lastQuarters + quarters;
        this.tempoChanges.push({
          time: lastTime,
          quarters: lastQuarters,
          tempo: lastTempo,
        });
      });
    } else {
      //default
      this.tempoChanges.push({
        time: 0,
        quarters: 0,
        tempo: 120,
      });
    }
    this.events = renderMidiStream(midi, channelFilter, generalMIDI);
    console.log(module.id, {channelFilter, events: this.events});
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
    if (this.playing) return this.getState();
    this.startTime = performance.now() - this.stoppedAt;
    this.playing = true;
    this._emitChange();
    return this.getState();
  }

  getPlayOffset() {
    if (this.playing) {
      return performance.now() - this.startTime;
    } else {
      return this.stoppedAt;
    }
  }

  setPlayOffset(offset) {
    if (this.playing) {
      this.startTime = performance.now() - offset;
      this._nextEvent = 0;
      while (
        this.events[this._nextEvent] &&
        this.events[this._nextEvent].time < offset
      ) {
        this._nextEvent++;
      }
    } else {
      this.stoppedAt = offset;
    }
    this._emitChange();
    return this.getState();
  }

  getPlayOffsetQuarters() {
    const offset = this.getPlayOffset();
    let lastTempoChange = this.tempoChanges[0];
    for (let i = 0; i < this.tempoChanges.length; i++) {
      const change = this.tempoChanges[i];
      if (change.time > offset) break;
      lastTempoChange = change;
    }
    let currentSectionLength = offset - lastTempoChange.time;
    const quarterMS = 60000 / lastTempoChange.tempo;
    const currentSectionQuarters = currentSectionLength / quarterMS;

    return lastTempoChange.quarters + currentSectionQuarters;
  }

  stop() {
    if (!this.playing) return this.getState();
    this.playing = false;
    this.stoppedAt = performance.now() - this.startTime;
    this._emitChange();
    return this.getState();
  }

  getState() {
    if (this.playing) {
      return {state: 'playing', startTime: this.startTime};
    } else {
      return {state: 'stopped', stoppedAt: this.stoppedAt};
    }
  }

  _emitChange() {
    const state = this.getState();
    this._subscribers.forEach((sub) => sub(state));
  }

  onStateChange(sub) {
    this._subscribers.push(sub);
    return () => {
      this._subscribers.filter((s) => !sub);
    };
  }
}

module.exports = Player;
