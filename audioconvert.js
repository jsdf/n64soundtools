const AIFF = require('./aiff');
const Wave = require('./wave');

function aiffToWave(aiffFile) {
  const parsedAIFF = AIFF.parse(aiffFile);
  if (parsedAIFF.form !== 'AIFF') {
    throw new Error(`AIFC not supported`);
  }

  const waveSoundData = parsedAIFF.soundData.slice();
  // to little endian
  if (parsedAIFF.sampleSize === 16) {
    waveSoundData.swap16();
  } else if (parsedAIFF.sampleSize !== 8) {
    throw new Error('unsupported bit depth: ' + parsedAIFF.sampleSize);
  }

  return Wave.serialize({
    audioFormat: 1, // linear PCM
    numChannels: parsedAIFF.numChannels,
    sampleRate: parsedAIFF.sampleRate,
    sampleSize: parsedAIFF.sampleSize,
    soundData: waveSoundData,
  });
}

function waveToAiff(waveFile) {
  const parsedWave = Wave.parse(waveFile);
  if (parsedWave.audioFormat !== 1) {
    throw new Error(`non PCM wave not supported`);
  }

  const aiffSoundData = parsedWave.soundData.slice();
  // to big endian
  if (parsedWave.sampleSize === 16) {
    aiffSoundData.swap16();
  } else if (parsedWave.sampleSize !== 8) {
    throw new Error('unsupported bit depth: ' + parsedWave.sampleSize);
  }

  return AIFF.serialize({
    numChannels: parsedWave.numChannels,
    sampleRate: parsedWave.sampleRate,
    sampleSize: parsedWave.sampleSize,
    soundData: aiffSoundData,
  });
}

module.exports = {
  aiffToWave,
  waveToAiff,
};
