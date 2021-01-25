const fs = require('fs');
const {aiffToWave, waveToAiff} = require('./audioconvert');

const aiffFile = fs.readFileSync('./test/genmidi_samples/0.aifc');

const waveFile = aiffToWave(aiffFile);

fs.writeFileSync('./test/test-out.wav', waveFile);
const finalAiff = waveToAiff(waveFile);

if (aiffFile.length !== finalAiff.length)
  throw new Error(
    `size changed from ${aiffFile.length} to ${finalAiff.length}`
  );

fs.writeFileSync('./test/test-out.aiff', finalAiff);
// fs.writeFileSync(
//   './test/test-out.aiff',
//   waveToAiff(fs.readFileSync('./test/11k16bitpcm.wav'))
// );
