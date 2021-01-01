const {getEventType} = require('./midiparse');

class Player {
  playing = false;
  startTime = 0;
  timeWindowLookahead = 0;
  _nextEvent = 0;
  _prevEvents = {};
  constructor(port) {
    this.events = [];

    port.onmidimessage = (midiMessage) => {
      try {
        // console.log(midiMessage.receivedTime, Buffer.from(midiMessage.data));
        this._onMidiMessage(midiMessage);
      } catch (err) {
        console.error(err);
      }
    };
  }

  _onMidiMessage(midiMessage) {
    const [status, data1, data2] = midiMessage.data;
    const type = getEventType(status);
    if (type === 'other') return;
    const time = performance.now();
    console.log(
      type,
      ...[...midiMessage.data].map((v) => v.toString(16)),
      time.toFixed(2)
    );

    if (!this._checkCooldown(type, midiMessage.data)) return;
    if (this.events.length > 30) {
      console.error('too many events enqueued');
      this.events = [];
      return;
    }
    this.events.push({
      time: time - 32,
      data: Buffer.from(midiMessage.data),
    });
  }

  _checkCooldown(type, [status, data1]) {
    // don't throttle notes
    if (type === 'noteOn' || type === 'noteOff') return true;

    let key = status.toString(16); // type + channel as key
    // for cc we want to also include the cc type in the key
    if (type === 'controlChange') {
      key += ':' + data1.toString(16);
    }

    const cooldownTime = 1000;
    const now = performance.now();
    if (now - (this._prevEvents[key] || 0) < cooldownTime) {
      return false;
    }

    this._prevEvents[key] = now;
    return true;
  }

  getPendingEvents(timeWindow) {
    const pending = this.events;
    this.events = [];
    return pending;
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
