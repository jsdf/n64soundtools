const {BufferStruct, BufferStructUnion} = require('./bufferstruct');

// typedef struct {
//     u8          *offset;
//     s32         len;
// } ALSeqData;

const ALSeqDataStruct = new BufferStruct({
  name: 'ALSeqData',
  endian: 'big',
  fields: {
    offset: {type: 'uint', size: 4}, // field uses storage of a 32 bit pointer
    len: {type: 'int', size: 4},
  },
});

// typedef struct {                /* Note: sizeof won't be correct        */
//     s16         revision;       /* format revision of this file         */
//     s16         seqCount;       /* number of sequences                  */
//     ALSeqData   seqArray[1];    /* ARRAY of sequence info               */
// } ALSeqFile;

const AL_SEQBANK_VERSION = 'S1';

const ALSeqFileStruct = new BufferStruct({
  name: 'ALSeqFile',
  endian: 'big',
  fields: {
    revision: {type: 'utf8', size: 2},
    seqCount: {type: 'int', size: 2},
    seqArray: {
      type: ALSeqDataStruct,
      arrayElements: (fields) => fields.seqCount,
    },
  },
});

function getAlignedSize(size, alignment) {
  return Math.ceil(size / alignment) * alignment;
}

function parseSBK(sbkBuffer) {
  const seqBank = ALSeqFileStruct.parse(sbkBuffer);
  seqBank.size = ALSeqFileStruct.lastOffset;

  if (seqBank.revision !== AL_SEQBANK_VERSION) {
    throw new Error(
      `unsupported/invalid ALSeqFile version ${seqBank.revision}`
    );
  }

  return seqBank;
}

function serializeSBK(inFiles) {
  const seqArray = [];
  inFiles.forEach((inFile) => {
    // fake offset for now
    seqArray.push({offset: 0, len: inFile.length});
  });

  // build header to get size
  const headerSize = ALSeqFileStruct.serialize({
    revision: AL_SEQBANK_VERSION,
    seqCount: inFiles.length,
    seqArray,
  }).length;

  // fix up offsets with real values
  let outputOffset = headerSize;
  inFiles.forEach((inFile, index) => {
    seqArray[index].offset = outputOffset;
    outputOffset += getAlignedSize(inFile.length, 8);
  });

  const output = Buffer.alloc(outputOffset);
  // build real header
  const outputHeader = ALSeqFileStruct.serialize({
    revision: AL_SEQBANK_VERSION,
    seqCount: inFiles.length,
    seqArray,
  });
  outputHeader.copy(output);

  inFiles.forEach((inFile, index) => {
    const seq = seqArray[index];
    // console.log('writing data at ', seq.offset, 'len', seq.len);
    inFile.copy(output, seq.offset);
  });

  return output;
}

module.exports = {
  parseSBK,
  serializeSBK,
};
