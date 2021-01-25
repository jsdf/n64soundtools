const fs = require('fs');
const AIFF = require('./aiff');

// const inFile = '../ultra/usr/lib/PR/sounds/SawWave2_C5.22k.aifc';
const inFile = './test/genmidi_samples/0.aifc';

const aiffFile = fs.readFileSync(inFile);

const parsed = AIFF.parse(aiffFile);
console.log(parsed);

const output = AIFF.serialize(parsed);

if (aiffFile.length !== output.length)
  throw new Error(`size changed from ${aiffFile.length} to ${output.length}`);

fs.writeFileSync('./test/test-out.aifc', output);
