const fs = require('fs');
const AIFF = require('./aiff');

const aiffFile = fs.readFileSync('./test/genmidi_samples/0.aifc');

const parsed = AIFF.parse(aiffFile);
console.log(parsed);

fs.writeFileSync('./test/test-out.aifc', AIFF.serialize(parsed));
