const ieeeExtended = require('./ieeeextended');
const {BufferStruct, BufferStructUnion} = require('./bufferstruct');

// AIFF stuff
// http://paulbourke.net/dataformats/audio/
// http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/AIFF/Docs/AIFF-1.3.pdf
const AIFFChunkStruct = new BufferStruct({
  name: 'AIFFChunk',
  endian: 'big',
  fields: {
    ckID: {type: 'utf8', size: 4},
    ckSize: {type: 'int', size: 4},
    chunkData: {type: 'bytes', align: 2, size: (fields) => fields.ckSize},
  },
});

// short numChannels;
// unsigned long numSampleFrames;
// short sampleSize;
// extended sampleRate;
const AIFFCommonStruct = new BufferStruct({
  name: 'AIFFCommon',
  endian: 'big',
  fields: {
    numChannels: {type: 'int', size: 2},
    numSampleFrames: {type: 'uint', size: 4},
    sampleSize: {type: 'int', size: 2},
    sampleRate: {type: 'bytes', size: 10},
  },
});

// unsigned long offset;
// unsigned long blockSize;
const AIFF_SOUND_DATA_CHUNK_SIZE_EXCL_SOUNDDATA = 8; // sum of fixed-size fields
const AIFFSoundDataStruct = new BufferStruct({
  name: 'AIFFSoundData',
  endian: 'big',
  fields: {
    offset: {type: 'uint', size: 4},
    blockSize: {type: 'uint', size: 4},
    soundData: {
      type: 'bytes',
      size: (fields, context) => context.soundDataSize,
    },
  },
});

function makeAIFFChunk(ckID, chunkData) {
  if (ckID === 'COMM' && chunkData.length !== 18) {
    throw new Error('invalid COMM chunk size:', chunkData.length);
  }

  return AIFFChunkStruct.serialize({
    ckID,
    ckSize: chunkData.length,
    chunkData,
  });
}

function serializeAIFF({soundData, numChannels, sampleRate, sampleSize}) {
  const nsamples = Math.floor(
    soundData.length / numChannels / (sampleSize / 8)
  );

  const commChunk = makeAIFFChunk(
    'COMM',
    AIFFCommonStruct.serialize({
      numChannels,
      numSampleFrames: nsamples,
      sampleSize,
      sampleRate: Buffer.from(ieeeExtended.ConvertToIeeeExtended(sampleRate)),
    })
  );

  const soundDataChunk = makeAIFFChunk(
    'SSND',
    Buffer.concat([
      AIFFSoundDataStruct.serialize(
        {
          offset: 0,
          blockSize: 0,
          soundData,
        },
        {
          soundDataSize: soundData.length,
        }
      ),
    ])
  );

  const aiffFileContents = makeAIFFChunk(
    'FORM',
    Buffer.concat([
      /*formType*/ Buffer.from('AIFF', 'utf8'),
      commChunk,
      soundDataChunk,
    ])
  );

  return aiffFileContents;
}

function parseAIFF(fileContents) {
  let pos = 0;

  const fileChunks = [];
  while (pos < fileContents.length) {
    const chunk = AIFFChunkStruct.parse(fileContents, pos);
    chunk.startOffset = pos;
    chunk.endOffset = AIFFChunkStruct.lastOffset;
    fileChunks.push(chunk);
    pos = AIFFChunkStruct.lastOffset;
  }

  const formChunks = fileChunks.filter(
    (fileChunk) => fileChunk.ckID === 'FORM'
  );
  formChunks.forEach((formChunk) => {
    let pos = 0;

    const localChunks = [];
    while (pos < localContents.length) {
      const chunk = AIFFChunkStruct.parse(localContents, pos);
      chunk.startOffset = pos;
      chunk.endOffset = AIFFChunkStruct.lastOffset;
      switch (chunk.ckID) {
        case 'COMM':
          chunk.comm = AIFFCommonStruct.parse(chunk.chunkData);
          chunk.comm.sampleRate = ieeeExtended.ConvertFromIeeeExtended(
            chunk.comm.sampleRate
          );
          break;
        case 'SSND':
          chunk.ssnd = AIFFSoundDataStruct.parse(chunk.chunkData, 0, {
            soundDataSize:
              chunk.ckSize - AIFF_SOUND_DATA_CHUNK_SIZE_EXCL_SOUNDDATA,
          });
          break;
      }

      localChunks.push(chunk);
      pos = AIFFChunkStruct.lastOffset;
    }
    formChunk.localChunks = localChunks;
  });

  return {fileChunks, formChunks};
}

module.exports = {
  serialize: serializeAIFF,
  parse: parseAIFF,
};
