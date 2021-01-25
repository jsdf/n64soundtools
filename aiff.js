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
// assumes 1 byte for pstring length storage (implying max length of 255)
const PSTRING_LENGTH_SIZE = 1;
class PStringParser extends BufferStructBase {
  constructor() {
    super({name: 'PString'});
  }
  parse(buffer, startOffset, contextData = null) {
    const length = buffer.readUInt8(startOffset);

    const str = buffer
      .slice(
        startOffset + PSTRING_LENGTH_SIZE,
        startOffset + PSTRING_LENGTH_SIZE + length
      )
      .toString('utf8');

    const consumed = getAlignedSize(PSTRING_LENGTH_SIZE + length, 2); // pad to multiple of 2

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
    if ((PSTRING_LENGTH_SIZE + data.length) % 2 === 1) {
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

// typedef short MarkerId;
const AIFFMarkerIdField = {type: 'int', size: 2, default: 0};
//   typedef struct {
//   MarkerId id; /* must be > 0 */
//   unsigned long position; /* sample frame number */
//   pstring markerName;
// } Marker;
const AIFFMarkerStruct = new BufferStruct({
  name: 'AIFFMarker',
  endian: 'big',
  fields: {
    id: AIFFMarkerIdField,
    position: {type: 'uint', size: 4},
    markerName: {type: PString},
  },
});

// typedef struct {
//   ID ckID;
//   long ckSize;
//   unsigned short numMarkers;
//   Marker Markers[];
// } MarkerChunk;
const AIFFMarkerChunkStruct = new BufferStruct({
  name: 'AIFFMarkerChunk',
  endian: 'big',
  fields: {
    numMarkers: {
      type: 'uint',
      size: 2,
    },
    markers: {
      type: AIFFMarkerStruct,
      arrayElements: (fields) => fields.numMarkers,
    },
  },
});

// typedef struct {
//   unsigned long timeStamp; /* comment creation date */
//   MarkerId marker; /* comments for this marker number */
//   unsigned short count; /* comment text string length */
//   char text[]; /* comment text */
// } Comment;
const AIFFCommentStruct = new BufferStruct({
  name: 'AIFFComment',
  endian: 'big',
  fields: {
    timeStamp: {type: 'uint', size: 4},
    marker: AIFFMarkerIdField,
    count: {type: 'uint', size: 2},
    text: {type: 'utf8', size: (fields) => fields.count},
  },
});

const LoopPlayMode = {
  NoLooping: 0,
  ForwardLooping: 1,
  ForwardBackwardLooping: 2,
};

// typedef struct {
//   short playMode;
//   MarkerId beginLoop;
//   MarkerId endLoop;
// } Loop;
const AIFFLoopStruct = new BufferStruct({
  name: 'AIFFLoop',
  endian: 'big',
  fields: {
    playMode: {type: 'int', size: 2, default: 0},
    beginLoop: AIFFMarkerIdField,
    endLoop: AIFFMarkerIdField,
  },
});

// typedef struct {
//   char baseNote;
//   char detune;
//   char lowNote;
//   char highNote;
//   char lowVelocity;
//   char highVelocity;
//   short gain;
//   Loop sustainLoop;
//   Loop releaseLoop;
// } InstrumentChunk;
const AIFFInstrumentStruct = new BufferStruct({
  name: 'AIFFInstrument',
  endian: 'big',
  fields: {
    baseNote: {type: 'int', size: 1, default: 0},
    detune: {type: 'int', size: 1, default: 0},
    lowNote: {type: 'int', size: 1, default: 0},
    highNote: {type: 'int', size: 1, default: 0},
    lowVelocity: {type: 'int', size: 1, default: 0},
    highVelocity: {type: 'int', size: 1, default: 0},
    gain: {type: 'int', size: 2, default: 0},
    sustainLoop: {
      type: AIFFLoopStruct,
      default: () => ({
        playMode: 0,
        beginLoop: 0,
        endLoop: 0,
      }),
    },
    releaseLoop: {
      type: AIFFLoopStruct,
      default: () => ({
        playMode: 0,
        beginLoop: 0,
        endLoop: 0,
      }),
    },
  },
});
const AIFFNameChunkID = 'NAME'; /* ckID for Name Chunk */
const AIFFAuthorChunkID = 'AUTH'; /* ckID for Author Chunk */
const AIFFCopyrightChunkID = '(c) '; /* ckID for Copyright Chunk */
const AIFFAnnotationChunkID = 'ANNO'; /* ckID for Annotation Chunk */
// typedef struct {
//   ID ckID;
//   long ckDataSize;
//   char text[];
// } TextChunk;
const AIFFTextStruct = new BufferStruct({
  name: 'AIFFText',
  endian: 'big',
  fields: {
    text: {type: 'utf8', size: (_, context) => context.dataSize},
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
  formType,
  compressionType,
  compressionName,
  chunks, // Array<{type:string, value: Object}>
  rawChunks, // Array<Buffer>
}) {
  const nsamples = Math.floor(
    soundData.length / numChannels / (sampleSize / 8)
  );
  const sampleRate80Bit = Buffer.from(
    ieeeExtended.ConvertToIeeeExtended(sampleRate)
  );
  DEBUG && console.log({sampleRate, sampleRate80Bit});

  const formatChunk =
    formType === 'AIFC'
      ? makeAIFFChunk(
          'FVER',
          AIFCFormatStruct.serialize({
            timestamp: AIFCVersion1,
          })
        )
      : null;

  const commChunk = makeAIFFChunk(
    'COMM',
    formType === 'AIFC'
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
    AIFFSoundDataStruct.serialize(
      {
        offset: 0,
        blockSize: 0,
        soundData,
      },
      {soundDataSize: soundData.length}
    )
  );

  const serializedChunks = [];
  (chunks || []).forEach((parsedChunk) => {
    if (DEBUG) {
      const unexpectedKeys = Object.keys(parsedChunk).filter(
        (key) => key !== 'type' && key !== 'value'
      );

      if (unexpectedKeys.length) {
        throw new Error(
          `unexpected keys on parsedChunk ${JSON.stringify(unexpectedKeys)}`
        );
      }
    }
    const value = parsedChunk.value;
    let serialized;
    switch (parsedChunk.type) {
      case 'SSND':
      case 'FVER':
      case 'COMM':
        return;
      case 'APPL':
        serialized = AIFCApplicationSpecificStruct.serialize(value, {
          dataSize: value.data.length,
        });
        break;
      case 'MARK':
        serialized = AIFFMarkerChunkStruct.serialize(value);
        break;
      case 'COMT':
        serialized = AIFFCommentStruct.serialize(value);
        break;
      case 'INST':
        serialized = AIFFInstrumentStruct.serialize(value);
        break;
      case AIFFNameChunkID:
      case AIFFAuthorChunkID:
      case AIFFCopyrightChunkID:
      case AIFFAnnotationChunkID:
        serialized = AIFFTextStruct.serialize(value, {
          dataSize: value.text.length,
        });
        break;
    }
    if (serialized) {
      serializedChunks.push(makeAIFFChunk(parsedChunk.type, serialized));
    }
  });

  const formTypeSerialized = Buffer.from(
    formType === 'AIFC' ? 'AIFC' : 'AIFF',
    'utf8'
  );

  const aiffFileContents = makeAIFFChunk(
    'FORM',
    Buffer.concat(
      [
        formTypeSerialized,
        formatChunk,
        commChunk,
        soundDataChunk,
        ...serializedChunks,
        ...(rawChunks || []),
      ].filter(Boolean)
    )
  );

  return aiffFileContents;
}

function parseAIFF(fileContents, options = {}) {
  let pos = 0;

  let output = {};

  const fileChunks = [];
  const parsedFormLocalChunks = [];

  while (pos < fileContents.length) {
    DEBUG &&
      console.error(
        'parsing file chunk',
        fileContents.slice(pos, pos + 4).toString('utf8'),
        'at',
        pos,
        {fileContents}
      );
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
    const formType = formChunk.chunkData.slice(0, 4).toString('utf8');
    formChunk.formType = formType;

    if (formType === 'AIFF' || formType === 'AIFC') {
      output.formType = formType;
    }
    pos += 4; // skip FORM identifier
    DEBUG && console.log({formType});

    const localChunks = [];
    while (pos < formChunk.chunkData.length) {
      DEBUG &&
        console.error(
          'parsing FORM local chunk',
          formChunk.chunkData.slice(pos, pos + 4),
          'at',
          pos
        );
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
          chunk.parsed =
            formType === 'AIFC'
              ? AIFCCommonStruct.parse(chunk.chunkData)
              : AIFFCommonStruct.parse(chunk.chunkData);
          chunk.parsed.sampleRate = ieeeExtended.ConvertFromIeeeExtended(
            chunk.parsed.sampleRate
          );

          output.sampleRate = chunk.parsed.sampleRate;
          output.sampleSize = chunk.parsed.sampleSize;
          output.numChannels = chunk.parsed.numChannels;
          output.compressionType = chunk.parsed.compressionType;
          output.compressionName = chunk.parsed.compressionName;
          break;
        case 'SSND':
          chunk.parsed = AIFFSoundDataStruct.parse(chunk.chunkData, 0, {
            soundDataSize:
              chunk.ckSize - AIFF_SOUND_DATA_CHUNK_SIZE_EXCL_SOUNDDATA,
          });
          output.soundData = chunk.parsed.soundData;
          break;
        case 'MARK':
          chunk.parsed = AIFFMarkerChunkStruct.parse(chunk.chunkData, 0);
          break;
        case 'COMT':
          chunk.parsed = AIFFCommentStruct.parse(chunk.chunkData, 0);
          break;
        case 'INST':
          chunk.parsed = AIFFInstrumentStruct.parse(chunk.chunkData, 0);
          break;
        case AIFFNameChunkID:
        case AIFFAuthorChunkID:
        case AIFFCopyrightChunkID:
        case AIFFAnnotationChunkID:
          chunk.parsed = AIFFTextStruct.parse(chunk.chunkData, 0, {
            dataSize: chunk.ckSize,
          });
          break;
        case 'APPL':
          chunk.parsed = AIFCApplicationSpecificStruct.parse(
            chunk.chunkData,
            0,
            {
              dataSize: chunk.ckSize - AIFC_APPL_CHUNK_SIZE_EXCL_DATA,
            }
          );
          break;
        case 'FVER':
          chunk.parsed = AIFCFormatStruct.parse(chunk.chunkData);
          break;
        default:
          DEBUG && console.error('unknown chunk type', chunk.ckID);
      }

      DEBUG && console.log('local chunk', chunk);
      parsedFormLocalChunks.push({type: chunk.ckID, value: chunk.parsed});

      localChunks.push(chunk);
      pos = AIFFChunkStruct.lastOffset;
    }
    formChunk.localChunks = localChunks;
  });

  if (options.includeRawChunks) {
    output.fileChunks = fileChunks;
  }
  output.chunks = parsedFormLocalChunks;
  return output;
}

module.exports = {
  serialize: serializeAIFF,
  parse: parseAIFF,
  PString,
  LoopPlayMode,
};
