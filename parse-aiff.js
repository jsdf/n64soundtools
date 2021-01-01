const fs = require('fs');
const AIFF = require('./aiff');

const {
  VADPCMApplChunkStruct,
  VADPCMBookChunkStruct,
  VADPCMLoopChunkStruct,
  VADPCM_CODE_NAME,
  VADPCM_LOOP_NAME,
} = require('./soundtools');

const aiffFile = fs.readFileSync(process.argv[2]);

const parsed = AIFF.parse(aiffFile);

console.log(parsed);
parsed.formChunks.forEach((ch) => console.log(ch.localChunks));

parsed.appl.forEach((appl) => {
  if (appl.applicationSignature === 'stoc') {
    try {
      const applParsed = VADPCMApplChunkStruct.parse(
        appl.data,
        0,
        appl.data.length
      );

      console.log(applParsed.chunkName);
      switch (applParsed.chunkName) {
        case VADPCM_CODE_NAME:
          console.log('book', VADPCMBookChunkStruct.parse(applParsed.data));
          break;
        case VADPCM_LOOP_NAME:
          console.log('loop', VADPCMLoopChunkStruct.parse(applParsed.data));
          break;
      }
    } catch (err) {
      console.error(err);
    }
  }
});
