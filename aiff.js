const ieeeExtended = require('./ieeeextended');
const {
  BufferStruct,
  BufferStructUnion,
  BufferStructBase,
} = require('./bufferstruct');

const DEBUG = false;

function getAlignedSize(size, alignment) {
  return Math.ceil(size / alignment) * alignment;
}

// pascal-style string
class PStringParser extends BufferStructBase {
  constructor() {
    super({name: 'PString'});
  }
  parse(buffer, startOffset, contextData = null) {
    const length = buffer.readUInt8(startOffset);

    const str = buffer
      .slice(startOffset + 1, startOffset + 1 + length)
      .toString('utf8');

    const consumed = getAlignedSize(1 + length, 2); // pad to multiple of 2

    this.lastOffset = startOffset + consumed;
    return str;
  }

  serialize(data, contextData = null) {
    if (!data) {
      throw new Error(
        `missing argument 'data' when serializing ${this.getName()}`
      );
    }

    const parts = [Buffer.from([data.length]), Buffer.from(data)];

    // pad to even size
    if ((1 + data.length) % 2 === 1) {
      parts.push(Buffer.alloc(1));
    }

    return Buffer.concat(parts);
  }
}

const PString = new PStringParser();

// AIFF stuff
// http://paulbourke.net/dataformats/audio/
// http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/AIFF/Docs/AIFF-1.3.pdf
// http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/AIFF/Docs/AIFF-C.9.26.91.pdf
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

// short numChannels; /* # audio channels */
// unsigned long numSampleFrames; /* # sample frames = samples/channel */
// short sampleSize; /* # bits/sample */
// extended sampleRate; /* sample_frames/sec */
// ID compressionType; /* compression type ID code */
// pstring compressionName; /* human-readable compression type name */
const AIFCCommonStruct = new BufferStruct({
  name: 'AIFCCommon',
  endian: 'big',
  fields: {
    numChannels: {type: 'int', size: 2},
    numSampleFrames: {type: 'uint', size: 4},
    sampleSize: {type: 'int', size: 2},
    sampleRate: {type: 'bytes', size: 10},
    compressionType: {type: 'utf8', size: 4},
    compressionName: {type: PString},
  },
});

// #define ApplicationSpecificID 'APPL' /* ckID for Application Specific Chunk */
// typedef struct {
// ID ckID; /* 'APPL' */
// long ckDataSize;
// OSType applicationSignature;
// char data[];
// } ApplicationSpecificChunk;
const AIFC_APPL_CHUNK_SIZE_EXCL_DATA = 4; // sum of fixed-size fields
const AIFCApplicationSpecificStruct = new BufferStruct({
  name: 'AIFCApplicationSpecific',
  endian: 'big',
  fields: {
    applicationSignature: {type: 'utf8', size: 4},
    data: {
      type: 'bytes',
      size: (fields, context) => context.dataSize,
    },
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
const AIFCVersion1 = 0xa2805140; /* Version 1 of AIFF-C */

const AIFCFormatStruct = new BufferStruct({
  name: 'AIFCFormat',
  endian: 'big',
  fields: {
    timestamp: {type: 'uint', size: 4},
  },
});

function makeAIFFChunk(ckID, chunkData) {
  return AIFFChunkStruct.serialize({
    ckID,
    ckSize: chunkData.length,
    chunkData,
  });
}

function serializeAIFF({
  soundData,
  numChannels,
  sampleRate,
  sampleSize,
  form,
  compressionType,
  compressionName,
  appl,
}) {
  const nsamples = Math.floor(
    soundData.length / numChannels / (sampleSize / 8)
  );
  const sampleRate80Bit = Buffer.from(
    ieeeExtended.ConvertToIeeeExtended(sampleRate)
  );
  DEBUG && console.log({sampleRate, sampleRate80Bit});

  const formatChunk =
    form === 'AIFC'
      ? makeAIFFChunk(
          'FVER',
          AIFCFormatStruct.serialize({
            timestamp: AIFCVersion1,
          })
        )
      : null;

  const commChunk = makeAIFFChunk(
    'COMM',
    form === 'AIFC'
      ? AIFCCommonStruct.serialize({
          numChannels,
          numSampleFrames: nsamples,
          sampleSize,
          sampleRate: sampleRate80Bit,
          compressionType,
          compressionName,
        })
      : AIFFCommonStruct.serialize({
          numChannels,
          numSampleFrames: nsamples,
          sampleSize,
          sampleRate: sampleRate80Bit,
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

  const applChunks =
    form === 'AIFC' && appl
      ? appl.map((applObj) =>
          makeAIFFChunk(
            'APPL',
            Buffer.concat([
              AIFCApplicationSpecificStruct.serialize(applObj, {
                dataSize: applObj.data.length,
              }),
            ])
          )
        )
      : [];

  const formType = Buffer.from(form === 'AIFC' ? 'AIFC' : 'AIFF', 'utf8');

  const aiffFileContents = makeAIFFChunk(
    'FORM',
    Buffer.concat(
      [formType, formatChunk, commChunk, soundDataChunk, ...applChunks].filter(
        Boolean
      )
    )
  );

  return aiffFileContents;
}

function parseAIFF(fileContents) {
  let pos = 0;

  let output = {};

  const fileChunks = [];
  while (pos < fileContents.length) {
    const chunk = AIFFChunkStruct.parse(fileContents, pos);
    chunk.startOffset = pos;
    chunk.endOffset = AIFFChunkStruct.lastOffset;
    fileChunks.push(chunk);
    pos = AIFFChunkStruct.lastOffset;
  }

  DEBUG && console.log(fileChunks);

  const formChunks = fileChunks.filter(
    (fileChunk) => fileChunk.ckID === 'FORM'
  );
  formChunks.forEach((formChunk) => {
    let pos = 0;
    DEBUG && console.log('FORM chunk', formChunk);
    formChunk.form = formChunk.chunkData.slice(0, 4).toString('utf8');
    output.form = formChunk.form;
    pos += 4; // skip FORM identifier
    DEBUG && console.log({formID: formChunk.form});

    const localChunks = [];
    while (pos < formChunk.chunkData.length) {
      const chunk = AIFFChunkStruct.parse(formChunk.chunkData, pos);
      chunk.startOffset = pos;
      chunk.endOffset = AIFFChunkStruct.lastOffset;

      if (chunk.ckSize === 0) {
        DEBUG &&
          console.error(
            'zero size chunk',
            formChunk.chunkData.slice(pos, pos + 64)
          );
      }
      switch (chunk.ckID) {
        case 'COMM':
          chunk.comm =
            formChunk.form === 'AIFC'
              ? AIFCCommonStruct.parse(chunk.chunkData)
              : AIFFCommonStruct.parse(chunk.chunkData);
          chunk.comm.sampleRate = ieeeExtended.ConvertFromIeeeExtended(
            chunk.comm.sampleRate
          );

          output.sampleRate = chunk.comm.sampleRate;
          output.sampleSize = chunk.comm.sampleSize;
          output.numChannels = chunk.comm.numChannels;
          output.compressionType = chunk.comm.compressionType;
          output.compressionName = chunk.comm.compressionName;
          break;
        case 'SSND':
          chunk.ssnd = AIFFSoundDataStruct.parse(chunk.chunkData, 0, {
            soundDataSize:
              chunk.ckSize - AIFF_SOUND_DATA_CHUNK_SIZE_EXCL_SOUNDDATA,
          });
          output.soundData = chunk.ssnd.soundData;
          break;
        case 'APPL':
          chunk.appl = AIFCApplicationSpecificStruct.parse(chunk.chunkData, 0, {
            dataSize: chunk.ckSize - AIFC_APPL_CHUNK_SIZE_EXCL_DATA,
          });
          output.appl = output.appl || [];
          output.appl.push(chunk.appl);
          break;
        case 'AIFC':
          chunk.format = AIFCFormatStruct.parse(chunk.chunkData);
          break;
        case 'FVER':
          chunk.fver = AIFCFormatStruct.parse(chunk.chunkData);
          break;
        default:
          DEBUG && console.error('unknown chunk type', chunk.ckID);
      }

      DEBUG && console.log('local chunk', chunk);

      localChunks.push(chunk);
      pos = AIFFChunkStruct.lastOffset;
    }
    formChunk.localChunks = localChunks;
  });
  output.fileChunks = fileChunks;
  output.formChunks = formChunks;
  return output;
}

module.exports = {
  serialize: serializeAIFF,
  parse: parseAIFF,
  PString,
};
