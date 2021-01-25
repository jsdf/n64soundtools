const fs = require('fs');
const {parseSBK} = require('./sequencebank');

const sbkBuffer = fs.readFileSync(
  '../ultra/usr/lib/PR/sequences/ship.sbk'
  // '../ultra/usr/lib/PR/sequences/cmpship.sbk'
  // '../ultra/usr/src/pr/demos/playseq.naudio/Midnight.sbk'
);

console.log(parseSBK(sbkBuffer));
