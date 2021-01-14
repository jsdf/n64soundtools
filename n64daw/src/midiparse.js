// https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
function getEventType(status) {
  switch (status >> 4) {
    case 0xb:
      return 'controlChange';
    case 0xc:
      return 'programChange';
    case 0x9:
      return 'noteOn';
    case 0x8:
      return 'noteOff';
    default:
      return 'other';
  }
}

function getChannel(status) {
  return status & 0xf;
}

module.exports = {
  getEventType,
  getChannel,
};
