const fs = require('fs');
const {parseSBK} = require('./sequencebank');

const sbkBuffer = fs.readFileSync(
  '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/sequences/ship.sbk'
  // '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/sequences/cmpship.sbk'
  // '/Users/jfriend/.wine/drive_c/ultra/usr/src/pr/demos/playseq.naudio/Midnight.sbk'
);

console.log(parseSBK(sbkBuffer));
