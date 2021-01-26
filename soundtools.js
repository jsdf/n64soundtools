const fs = require('fs');
const path = require('path');

const AIFF = require('./aiff');
const {BufferStruct, BufferStructUnion} = require('./bufferstruct');
const InstParserUtils = require('./instparserutils');

const DEBUG = false;

const AL_ADPCM_WAVE = 0;
const AL_RAW16_WAVE = 1;
const ADPCMVSIZE = 8; // size of one value in book
const ADPCMFSIZE = 16; // used in ADPCM_STATE type
const SIZEOF_SHORT = 2;

// flags fields determine whether to interpret references as offsets or pointers
const FLAGS_REF_AS_OFFSET = 0;

// typedef struct {
//         s16     revision;
//         s16     bankCount;
//         s32     bankArray[1];
// } ALBankFile;
const ALBankFileStruct = new BufferStruct({
  name: 'ALBankFile',
  endian: 'big',
  fields: {
    revision: {type: 'bytes', size: 2},
    bankCount: {type: 'int', size: 2},
    bankArray: {
      type: 'int',
      size: 4,
      arrayElements: (fields) => fields.bankCount,
    },
  },
});

// typedef struct {
//         s16   instCount;
//          u8   flags;
//          u8   pad;
//         s32   sampleRate;
//         s32   percussion;
//         s32   instArray[1];
// } ALBank;

const ALBankStruct = new BufferStruct({
  name: 'ALBank',
  endian: 'big',
  fields: {
    instCount: {type: 'int', size: 2},
    flags: {type: 'uint', size: 1},
    pad: {type: 'uint', size: 1},
    sampleRate: {type: 'int', size: 4},
    percussion: {type: 'int', size: 4},
    instArray: {
      type: 'int',
      size: 4,
      arrayElements: (fields) => fields.instCount,
    },
  },
});

// typedef struct {
//         u8      volume;
//         u8      pan;
//         u8      priority;
//         u8      flags;
//         u8      tremType;
//         u8      tremRate;
//         u8      tremDepth;
//         u8      tremDelay;
//         u8      vibType;
//         u8      vibRate;
//         u8      vibDepth;
//         u8      vibDelay;
//         s16     bendRange;
//         s16     soundCount;
//         s32     soundArray[1];
// } ALInstrument;

const ALInstrumentStruct = new BufferStruct({
  name: 'ALInstrument',
  endian: 'big',
  fields: {
    volume: {type: 'uint', size: 1},
    pan: {type: 'uint', size: 1},
    priority: {type: 'uint', size: 1},
    flags: {type: 'uint', size: 1},
    tremType: {type: 'uint', size: 1},
    tremRate: {type: 'uint', size: 1},
    tremDepth: {type: 'uint', size: 1},
    tremDelay: {type: 'uint', size: 1},
    vibType: {type: 'uint', size: 1},
    vibRate: {type: 'uint', size: 1},
    vibDepth: {type: 'uint', size: 1},
    vibDelay: {type: 'uint', size: 1},
    bendRange: {type: 'int', size: 2},
    soundCount: {type: 'int', size: 2},
    soundArray: {
      type: 'int',
      size: 4,
      arrayElements: (fields) => fields.soundCount,
    },
  },
});

// typedef struct Sound_s {
//         s32     envelope;
//         s32     keyMap;
//         s32     wavetable;
//         u8      samplePan;
//         u8      sampleVolume;
//         u8      flags;
// } ALSound;

const ALSoundStruct = new BufferStruct({
  name: 'ALSound',
  endian: 'big',
  fields: {
    envelope: {type: 'uint', size: 4},
    keyMap: {type: 'uint', size: 4},
    wavetable: {type: 'uint', size: 4},
    samplePan: {type: 'uint', size: 1},
    sampleVolume: {type: 'uint', size: 1},
    flags: {type: 'uint', size: 1},
  },
});

// typedef struct {
//     s32 attackTime;
//     s32 decayTime;
//     s32 releaseTime;
//     u8  attackVolume;
//     u8  decayVolume;
// } ALEnvelope;

const ALEnvelopeStruct = new BufferStruct({
  name: 'ALEnvelope',
  endian: 'big',
  fields: {
    attackTime: {type: 'int', size: 4},
    decayTime: {type: 'int', size: 4},
    releaseTime: {type: 'int', size: 4},
    attackVolume: {type: 'int', size: 1},
    decayVolume: {type: 'int', size: 1},
  },
});

// typedef struct {
//         u8      velocityMin;
//         u8      velocityMax;
//         u8      keyMin;
//         u8      keyMax;
//         u8      keyBase;
//         u8      detune;
// } ALKeyMap;

const ALKeyMapStruct = new BufferStruct({
  name: 'ALKeyMap',
  endian: 'big',
  fields: {
    velocityMin: {type: 'uint', size: 1},
    velocityMax: {type: 'uint', size: 1},
    keyMin: {type: 'uint', size: 1},
    keyMax: {type: 'uint', size: 1},
    keyBase: {type: 'uint', size: 1},
    detune: {type: 'uint', size: 1},
  },
});

// typedef struct {
//     s32 order;
//     s32 npredictors;
//     s16 book[1];        /* Actually variable size. Must be 8-byte aligned */
// } ALADPCMBook;

const ALADPCMBookStruct = new BufferStruct({
  name: 'ALADPCMBook',
  endian: 'big',
  fields: {
    order: {type: 'uint', size: 4},
    npredictors: {type: 'uint', size: 4},
    book: {
      type: 'bytes',
      size: (fields) => {
        const bookSize = fields.npredictors * fields.order * ADPCMVSIZE;
        const bookBytes = bookSize * SIZEOF_SHORT;
        return bookBytes;
      },
    },
  },
});

// typedef short ADPCM_STATE[ADPCMFSIZE];
// typedef struct {
//     u32         start;
//     u32         end;
//     u32         count;
//     ADPCM_STATE state;
// } ALADPCMloop;

const ALADPCMloopStruct = new BufferStruct({
  name: 'ALADPCMloop',
  endian: 'big',
  fields: {
    start: {type: 'uint', size: 4},
    end: {type: 'uint', size: 4},
    count: {type: 'uint', size: 4},
    state: {type: 'bytes', size: SIZEOF_SHORT * ADPCMFSIZE},
  },
});

// typedef struct {
//     u32         start;
//     u32         end;
//     u32         count;
// } ALRawLoop;

const ALRawLoopStruct = new BufferStruct({
  name: 'ALRawLoop',
  endian: 'big',
  fields: {
    start: {type: 'uint', size: 4},
    end: {type: 'uint', size: 4},
    count: {type: 'uint', size: 4},
  },
});

// typedef struct{
//         ALADPCMloop     *loop;
//         ALADPCMBook     *book;
// }ALADPCMWaveInfo;

const ALADPCMWaveInfoStruct = new BufferStruct({
  name: 'ALADPCMWaveInfo',
  endian: 'big',
  fields: {
    loop: {type: 'uint', size: 4},
    book: {type: 'uint', size: 4},
  },
});

// typedef struct{
//         ALRawLoop       *loop;
// }ALRAWWaveInfo;

const ALRAWWaveInfoStruct = new BufferStruct({
  name: 'ALRAWWaveInfo',
  endian: 'big',
  fields: {
    loop: {type: 'uint', size: 4},
  },
});

// typedef struct{
//         s32             base;
//         s32             len;
//         u8              type;
//         u8              flags;
//         union{
//                         ALADPCMWaveInfo adpcmWave;
//                         ALRAWWaveInfo           rawWave;
//         }waveInfo;
// } ALWaveTable;

const ALWaveTableStruct = new BufferStruct({
  name: 'ALWaveTable',
  endian: 'big',
  fields: {
    base: {type: 'int', size: 4},
    len: {type: 'int', size: 4},
    type: {type: 'uint', size: 1},
    flags: {type: 'uint', size: 1},
    pad: {type: 'uint', size: 2, default: 0}, // simulate c struct member alignment behavior
    waveInfo: {
      type: new BufferStructUnion({
        members: [ALADPCMWaveInfoStruct, ALRAWWaveInfoStruct],
        selectMember: (fields) => {
          switch (fields.type) {
            case AL_ADPCM_WAVE:
              return ALADPCMWaveInfoStruct;
            case AL_RAW16_WAVE:
              return ALRAWWaveInfoStruct;
          }
        },
      }),
    },
  },
});

const VADPCM_CODE_NAME = 'VADPCMCODES';
const VADPCM_LOOP_NAME = 'VADPCMLOOPS';
const VADPCM_VERSION = 1;

// short version;
// short order;
// short npredictors;
// short book[]
const VADPCMBookChunkStruct = new BufferStruct({
  name: 'VADPCMBookChunk',
  endian: 'big',
  fields: {
    version: {type: 'int', size: 2},
    order: {type: 'int', size: 2},
    npredictors: {type: 'int', size: 2},
    book: {
      type: 'bytes',
      size: (fields) => {
        const bookSize = fields.npredictors * fields.order * ADPCMVSIZE;
        const bookBytes = bookSize * SIZEOF_SHORT;
        return bookBytes;
      },
    },
  },
});

// short version;
// short nloops;
// ALADPCMloop aloops[]
const VADPCMLoopChunkStruct = new BufferStruct({
  name: 'VADPCMLoopChunk',
  endian: 'big',
  fields: {
    version: {type: 'int', size: 2},
    nloops: {type: 'int', size: 2},
    aloops: {
      type: ALADPCMloopStruct,
      arrayElements: (fields) => fields.nloops,
    },
  },
});

const VADPCMApplDataFieldStruct = new BufferStruct({
  name: 'VADPCMApplDataField',
  endian: 'big',
  fields: {
    chunkName: {type: AIFF.PString},
    data: {
      type: 'bytes',
      size: (fields, {applDataFieldSize}) =>
        applDataFieldSize - (fields.chunkName.length + 1),
      // type: new BufferStructUnion({
      //   members: [VADPCMBookChunkStruct, VADPCMLoopChunkStruct],
      //   selectMember: (fields) => {
      //     switch (fields.chunkName) {
      //       case VADPCM_CODE_NAME:
      //         return VADPCMBookChunkStruct;
      //       case VADPCM_LOOP_NAME:
      //         return VADPCMLoopChunkStruct;
      //     }
      //   },
      // }),
    },
  },
});

// handles the union case selection for the different vadpcm data types
function parseVADPCMApplDataField(applChunk) {
  if (applChunk.applicationSignature !== 'stoc') return null;
  let parsed;
  parsed = VADPCMApplDataFieldStruct.parse(applChunk.data, 0, {
    applDataFieldSize: applChunk.data.length,
  });

  // skipping over pstring length field, peek at the pstring contents to check
  // if it's one of our VADPCM data chunks
  if (
    !(
      applChunk.data.length > 1 + 'VADPCM'.length &&
      applChunk.data.slice(1, 1 + 'VADPCM'.length).toString('utf8') === 'VADPCM'
    )
  ) {
    return null;
  }
  switch (parsed.chunkName) {
    case VADPCM_CODE_NAME:
      return {
        chunkName: parsed.chunkName,
        parsed: VADPCMBookChunkStruct.parse(parsed.data),
      };
    case VADPCM_LOOP_NAME:
      return {
        chunkName: parsed.chunkName,
        parsed: VADPCMLoopChunkStruct.parse(parsed.data),
      };
    default:
      return null;
  }
  return null;
}

// this just abstracts the logic to calculate applDataFieldSize
function serializeVADPCMApplDataField({chunkName, data}) {
  return VADPCMApplDataFieldStruct.serialize(
    {
      chunkName,
      data,
    },

    // chunkName pstring size is chunkName.length + 1
    {applDataFieldSize: chunkName.length + 1 + data.length}
  );
}

function isInvalidAIFFFromN64SDK(aiffFile) {
  const firstChunkId = aiffFile.slice(0, 4).toString('utf8');
  const firstChunkSize = aiffFile.readInt32BE(4);

  // the n64 sdk comes with some VADPCM samples which are invalid aiff files
  // as the chunk size defined by their FORM chunk is bigger than the entire file.
  // this is a gross hack to correct these particular files so we can parse them
  if (
    firstChunkId === 'FORM' &&
    aiffFile.length < firstChunkSize + 8 &&
    aiffFile.length > 0x26 + 4
  ) {
    const vadpmCreator = aiffFile.slice(0x26, 0x26 + 4).toString('utf8');
    if (vadpmCreator === 'VAPC') {
      // pretty sure this is one of those broken files
      return true;
    }
  }
  return false;
}

// super hacky
// only use this on files which return true from isInvalidAIFFFromN64SDK()
function fixInvalidAIFFFromN64SDK(aiffFile) {
  aiffFile.writeInt32BE(aiffFile.length - 8, 4);
}

function instFileTextGen(defs) {
  return (
    defs
      .map((def) => {
        const members = [];
        const typeSchema = InstParserUtils.schemas[def.type];
        if (!typeSchema) {
          throw new Error(`no schema for type '${def.type}'`);
        }
        Object.entries(def.value).forEach(([fieldName, value]) => {
          const fieldType = typeSchema.members[fieldName];
          if (!fieldType)
            throw new Error(`no field ${fieldName} on type ${def.type}`);
          if (fieldType == 'file') {
            members.push(`use("${value}");`);
          } else if (Array.isArray(value)) {
            if (fieldType === 'symbolMap' || fieldType === 'symbolArray') {
              value.forEach((ref, i) => {
                if (!InstParserUtils.getSymbolName(ref))
                  throw new Error(
                    `expected symbol, got ${JSON.stringify(
                      ref
                    )} in ${fieldName} on type ${def.type} `
                  );
                const symbolName = InstParserUtils.getSymbolName(ref);
                members.push(
                  fieldType === 'symbolMap'
                    ? `${fieldName} [${i}] = ${symbolName};`
                    : `${fieldName} = ${symbolName};`
                );
              });
            } else {
              throw new Error(
                `array not valid value for field ${fieldName} on ${def.type}`
              );
            }
          } else if (InstParserUtils.isSymbol(value)) {
            members.push(
              `${fieldName} = ${InstParserUtils.getSymbolName(value)};`
            );
          } else if (typeof value === 'number') {
            members.push(`${fieldName} = ${String(value)};`);
          } else {
            throw new Error(
              `unsupported value "${JSON.stringify(
                value
              )}" for field ${fieldName} on ${def.type}`
            );
          }
        });
        return `${def.type} ${def.name} {\n${members
          .map((v) => '  ' + v)
          .join('\n')}\n}`;
      })
      .join('\n\n') + '\n'
  );
}

function parseCtl(ctlBuffer, startOffset) {
  let lastOffset = startOffset;
  function updateLastOffset(structParser) {
    lastOffset = Math.max(lastOffset, structParser.lastOffset);
  }

  const bankFile = ALBankFileStruct.parse(ctlBuffer, startOffset);
  updateLastOffset(ALBankFileStruct);

  // DEBUG && console.log('bankFile', bankFile);

  bankFile.banks = {};
  bankFile.bankArray.forEach((offset) => {
    bankFile.banks[offset] = ALBankStruct.parse(
      ctlBuffer,
      startOffset + offset
    );
    updateLastOffset(ALBankStruct);
  });
  DEBUG && console.log('bankFile.banks', bankFile.banks);

  bankFile.instruments = {};
  Object.values(bankFile.banks).forEach((bank) => {
    bank.instArray.forEach((offset) => {
      if (!bankFile.instruments[offset]) {
        bankFile.instruments[offset] = ALInstrumentStruct.parse(
          ctlBuffer,
          startOffset + offset
        );
        updateLastOffset(ALInstrumentStruct);
      }
    });

    if (bank.percussion) {
      if (!bankFile.instruments[bank.percussion]) {
        bankFile.instruments[bank.percussion] = ALInstrumentStruct.parse(
          ctlBuffer,
          startOffset + bank.percussion
        );
        updateLastOffset(ALInstrumentStruct);
      }
    }
  });

  DEBUG &&
    console.log(
      'bankFile.instruments',
      Object.values(bankFile.instruments).slice(0, 4)
    );

  bankFile.sounds = {};
  Object.values(bankFile.instruments).forEach((instrument) => {
    instrument.soundArray.forEach((offset) => {
      if (!bankFile.sounds[offset]) {
        bankFile.sounds[offset] = ALSoundStruct.parse(
          ctlBuffer,
          startOffset + offset
        );
        updateLastOffset(ALSoundStruct);
      }
    });
  });
  DEBUG &&
    console.log('bankFile.sounds', Object.values(bankFile.sounds).slice(0, 4));

  bankFile.envelopes = {};
  bankFile.keyMaps = {};
  bankFile.wavetables = {};
  bankFile.books = {};
  bankFile.loops = {};
  Object.values(bankFile.sounds).forEach((sound) => {
    if (!bankFile.envelopes[sound.envelope]) {
      bankFile.envelopes[sound.envelope] = ALEnvelopeStruct.parse(
        ctlBuffer,
        startOffset + sound.envelope
      );
      updateLastOffset(ALEnvelopeStruct);
    }

    if (!bankFile.keyMaps[sound.keyMap]) {
      bankFile.keyMaps[sound.keyMap] = ALKeyMapStruct.parse(
        ctlBuffer,
        startOffset + sound.keyMap
      );
      updateLastOffset(ALKeyMapStruct);
    }
    if (!bankFile.wavetables[sound.wavetable]) {
      bankFile.wavetables[sound.wavetable] = ALWaveTableStruct.parse(
        ctlBuffer,
        startOffset + sound.wavetable
      );
      updateLastOffset(ALWaveTableStruct);
    }

    const wavetable = bankFile.wavetables[sound.wavetable];

    if (wavetable.waveInfo.loop) {
      const loopOffset = wavetable.waveInfo.loop;

      if (!bankFile.loops[loopOffset]) {
        if (wavetable.type === AL_ADPCM_WAVE) {
          bankFile.loops[loopOffset] = ALADPCMloopStruct.parse(
            ctlBuffer,
            startOffset + loopOffset
          );
          updateLastOffset(ALADPCMloopStruct);
        } else if (wavetable.type === AL_RAW16_WAVE) {
          bankFile.loops[loopOffset] = ALRawLoopStruct.parse(
            ctlBuffer,
            startOffset + loopOffset
          );
          updateLastOffset(ALRawLoopStruct);
        } else {
          throw new Error(
            `unsupported wavetable compression type: ${wavetable.type}`
          );
        }
      }
    }

    if (wavetable.type == AL_ADPCM_WAVE && wavetable.waveInfo.book) {
      const bookOffset = wavetable.waveInfo.book;
      if (!bankFile.books[bookOffset]) {
        bankFile.books[bookOffset] = ALADPCMBookStruct.parse(
          ctlBuffer,
          startOffset + bookOffset
        );
        updateLastOffset(ALADPCMBookStruct);
      }
    }
  });
  DEBUG &&
    console.log(
      'bankFile.envelopes',
      Object.values(bankFile.envelopes).slice(0, 4)
    );
  DEBUG &&
    console.log(
      'bankFile.keyMaps',
      Object.values(bankFile.keyMaps).slice(0, 4)
    );
  DEBUG &&
    console.log(
      'bankFile.wavetables',
      Object.values(bankFile.wavetables).slice(0, 4)
    );
  DEBUG &&
    console.log('bankFile.books', Object.values(bankFile.books).slice(0, 4));

  bankFile.lastOffset = lastOffset;

  return bankFile;
}

async function bankToSource(
  ctlBuffer,
  ctlStartOffset,
  tblBuffer,
  tblStartOffset,
  outPath,
  generalMidi
) {
  const outFilePrefix = outPath.replace(/\.inst$/, '');
  const outFileName = path.basename(outFilePrefix);
  const outFileDir = path.dirname(outPath);
  const outSamplesDirName = outFileName + '_samples';
  const outSamplesDir = path.join(outFileDir, outSamplesDirName);

  await fs.promises.mkdir(outSamplesDir, {recursive: true});

  const bankFile = parseCtl(ctlBuffer, ctlStartOffset);

  function formatRef(type, ref) {
    return `${type}_${ref}`;
  }

  const refFields = {
    // map to referenced type
    bankArray: 'bank',
    instArray: 'instrument',
    soundArray: 'sound',
    percussion: 'instrument',
    envelope: 'envelope',
    keyMap: 'keymap',
  };

  const ignoreFields = new Set([
    'flags',
    'pad',
    'bankCount',
    'instCount',
    'soundCount',
  ]);

  const renamedFields = {
    // struct field name -> inst file def member name
    percussion: 'percussionDefault',
    keyMap: 'keymap',
    samplePan: 'pan',
    sampleVolume: 'volume',
    bankArray: 'bank',
    instArray: 'instrument',
    soundArray: 'sound',
  };
  // translate objects of offset -> struct into array of objects for text gen
  function objByOffsetToDefs(obj, type) {
    return Object.entries(obj).map(([offset, struct]) => {
      // massage the object format a bit
      const value = {};
      Object.keys(struct).forEach((key) => {
        const outFieldName = renamedFields[key] || key;
        if (ignoreFields.has(key)) {
          return;
        }
        if (key in refFields) {
          const referencedType = refFields[key];
          const fieldValue = struct[key];
          if (Array.isArray(fieldValue)) {
            value[outFieldName] = struct[key].map((refArrayItemAsOffset) => ({
              type: 'symbol',
              value: formatRef(referencedType, String(refArrayItemAsOffset)),
            }));
          } else {
            value[outFieldName] = {
              type: 'symbol',
              value: formatRef(referencedType, String(struct[key])),
            };
          }

          return;
        }

        // otherwise, just copy the value to the output object
        value[outFieldName] = struct[key];
      });

      return {
        type,
        name: formatRef(type, offset),
        value,
      };
    });
  }

  function makeWavetableFilePath(wavetable) {
    return path.join(
      outSamplesDirName,
      wavetable.base + (wavetable.type == AL_ADPCM_WAVE ? '.aifc' : '.aiff')
    );
  }

  // make a minimal effort to find a sample rate from the ctl
  let defaultSampleRate = 44100;
  const firstBank = Object.values(bankFile.banks)[0];
  if (firstBank && firstBank.sampleRate !== 0) {
    defaultSampleRate = firstBank.sampleRate;
  }

  await fs.promises.writeFile(
    outFilePrefix + '.inst',
    instFileTextGen(
      [].concat(
        objByOffsetToDefs(bankFile.banks, 'bank'),
        objByOffsetToDefs(bankFile.instruments, 'instrument'),
        objByOffsetToDefs(bankFile.sounds, 'sound').map((soundDef) => {
          const {wavetable: wavetableOffset, ...fields} = soundDef.value;
          // replace offset with path to actual file
          const wavetable = bankFile.wavetables[wavetableOffset];
          if (!wavetable)
            throw new Error(
              `couldn't find wavetable ${wavetableOffset} from ${soundDef.name}`
            );
          const value = {
            ...fields,
            use: makeWavetableFilePath(wavetable),
          };
          return {...soundDef, value};
        }),
        objByOffsetToDefs(bankFile.keyMaps, 'keymap'),
        objByOffsetToDefs(bankFile.envelopes, 'envelope')
      )
    )
  );
  await Promise.all(
    Object.keys(bankFile.wavetables).map((offset) => {
      const wavetable = bankFile.wavetables[offset];
      const soundWaveData = tblBuffer.slice(
        tblStartOffset + wavetable.base,
        tblStartOffset + wavetable.base + wavetable.len
      );
      const chunks = [];
      let aifcFields = null;
      if (wavetable.type === AL_ADPCM_WAVE) {
        // write VADPCM AIFC with codebook
        if (wavetable.waveInfo.book) {
          const book = bankFile.books[wavetable.waveInfo.book];

          chunks.push({
            type: 'APPL',
            value: {
              applicationSignature: 'stoc',
              data: serializeVADPCMApplDataField({
                chunkName: VADPCM_CODE_NAME,
                data: VADPCMBookChunkStruct.serialize({
                  version: VADPCM_VERSION,
                  ...book,
                }),
              }),
            },
          });
        } else {
          throw new Error(
            `AL_ADPCM_WAVE missing book for ${makeWavetableFilePath(wavetable)}`
          );
        }

        if (wavetable.waveInfo.loop) {
          const loop = bankFile.loops[wavetable.waveInfo.loop];
          if (!loop)
            throw new Error('missing loop data for wavetable at ' + offset);

          chunks.push({
            type: 'APPL',
            value: {
              applicationSignature: 'stoc',
              data: serializeVADPCMApplDataField({
                chunkName: VADPCM_LOOP_NAME,
                data: VADPCMLoopChunkStruct.serialize({
                  version: VADPCM_VERSION,
                  nloops: 1,
                  aloops: [loop],
                }),
              }),
            },
          });
        }

        aifcFields = {
          formType: 'AIFC',
          compressionType: 'VAPC',
          compressionName: 'VADPCM ~4-1',
        };
      } else if (wavetable.type === AL_RAW16_WAVE) {
        if (wavetable.waveInfo.loop) {
          const loop = bankFile.loops[wavetable.waveInfo.loop];
          if (!loop)
            throw new Error('missing loop data for wavetable at ' + offset);
          chunks.push({
            type: 'MARK',
            value: {
              numMarkers: 2,
              markers: [
                {
                  id: 1,
                  position: loop.start,
                  markerName: 'beg loop',
                },
                {
                  id: 2,
                  position: loop.end,
                  markerName: 'end loop',
                },
              ],
            },
          });
          chunks.push({
            type: 'INST',
            value: {
              sustainLoop: {
                playMode: 1,
                beginLoop: 1,
                endLoop: 2,
              },
              releaseLoop: {
                playMode: 0,
                beginLoop: 0,
                endLoop: 0,
              },
            },
          });
        }
      } else {
        throw new Error(`unsupported compression type: ${wavetable.type}`);
      }

      const aiffFileContents = AIFF.serialize({
        soundData: soundWaveData,
        numChannels: 1,
        sampleSize: 16,
        sampleRate: defaultSampleRate,
        ...aifcFields,
        chunks,
      });

      return fs.promises.writeFile(
        path.join(outFileDir, makeWavetableFilePath(wavetable)),
        aiffFileContents
      );
    })
  );
}

function loadAIFFData(file) {
  const aiff = AIFF.parse(fs.readFileSync(file));

  if (!aiff.soundData) {
    throw new Error(`file ${file} does not contain SSND chunk`);
  }
  return aiff;
}

function getSymbolField(obj, fieldName) {
  if (!InstParserUtils.isSymbol(obj.value[fieldName])) {
    throw new Error(
      `Field '${fieldName}' not set on ${obj.type} ${obj.name} but it is required`
    );
  }

  return InstParserUtils.getSymbolName(obj.value[fieldName]);
}

function getAlignedSize(size, alignment) {
  return Math.ceil(size / alignment) * alignment;
}

class FileTable {
  chunks = new Map();
  size = 0;
  constructor(alignment = null) {
    this.alignment = alignment;
  }
  insertBuffer(buffer) {
    if (this.alignment != null) {
      // advance position of next insertion to be aligned as required
      this.size = getAlignedSize(this.size, this.alignment);
    }
    const location = this.size;
    this.chunks.set(location, buffer);
    this.size += buffer.length;
    return location;
  }

  replaceBuffer(offset, buffer) {
    if (!this.chunks.has(offset)) {
      throw new Error(
        `tried to replace buffer at ${offset} but none found at that offset`
      );
    }
    const expectedLength = this.chunks.get(offset).length;
    if (expectedLength !== buffer.length) {
      throw new Error(
        `replacing buffer of length ${expectedLength} with incorrect buffer of length ${buffer.length} at ${offset}`
      );
    }
    this.chunks.set(offset, buffer);
  }

  build() {
    return Buffer.concat(
      Array.from(this.chunks.entries()).map(([offset, chunk]) => {
        if (this.alignment == null) return chunk;
        // pad any chunks to match alignment
        // assumes we also aligned their start pos correctly when inserting them
        const alignedSize = getAlignedSize(chunk.length, this.alignment);
        if (alignedSize == chunk.length) {
          return chunk;
        } else {
          const padded = Buffer.alloc(alignedSize);
          chunk.copy(padded);
          return padded;
        }
      })
    );
  }
}

class ALBankFileWriter {
  objects = new Map(
    [
      'bank',
      'instrument',
      'sound',
      'keymap',
      'envelope',
      'wavetable',
    ].map((key) => [key, new Map()])
  );

  ctl = new FileTable(/* 8-byte alignment */ 8);
  tbl = new FileTable(/* 16-byte alignment */ 8);

  constructor(defs, sourceFileLocation) {
    this.sourceFileLocation = sourceFileLocation;
    defs.forEach((obj) => {
      this.insertObject(obj);
      if (obj.type === 'sound') {
        if (!obj.value.file)
          throw new Error(`sound with no file defined: ${JSON.stringify(obj)}`);

        if (!this.hasObject('wavetable', obj.value.file)) {
          // .inst files reference audio files with use() statement rather than a
          // def block of their own, so we create an object to represent the
          // actual audio file contents
          this.insertObject({
            type: 'wavetable',
            name: obj.value.file,
            value: {file: obj.value.file},
          });
        }
      }
    });
  }

  getObjectsOfType(type) {
    const objectsForType = this.objects.get(type);
    if (!objectsForType) {
      throw new Error(`unsupported object type '${obj.type}'`);
    }
    return objectsForType;
  }

  hasObject(type, name) {
    return this.objects.get(type) && this.objects.get(type).has(name);
  }

  insertObject(obj) {
    const objectsForType = this.getObjectsOfType(obj.type);
    if (objectsForType.has(obj.name)) {
      throw new Error(`${obj.type} ${obj.name} inserted twice`);
    }

    objectsForType.set(obj.name, {obj, offset: null});
  }

  dependOnFieldReferencedObject({type, field, source}) {
    const referencedSymbolName = getSymbolField(source, field);
    if (!this.hasObject(type, referencedSymbolName)) {
      throw new Error(
        `${type} '${referencedSymbolName}' referenced from ${source.type} '${source.name}' but no ${type} exists with that name`
      );
    }

    return this.dependOnObject({type, name: referencedSymbolName});
  }

  dependOnReferencedObject({type, field, reference, source}) {
    if (!InstParserUtils.isSymbol(reference)) {
      throw new Error(
        `Invalid reference ${JSON.stringify(
          reference
        )} in field '${field}' on ${source.type} ${source.name}`
      );
    }

    const name = InstParserUtils.getSymbolName(reference);
    if (!this.hasObject(type, name)) {
      throw new Error(
        `${type} '${name}' referenced from ${source.type} '${source.name}' but no ${type} exists with that name`
      );
    }

    return this.dependOnObject({type, name});
  }

  dependOnObject({type, name}) {
    const objMetadata = this.getObjectsOfType(type).get(name);
    if (!objMetadata) {
      throw new Error(
        `${type} '${name}' required but no ${type} exists with that name`
      );
    }

    const existingOffset = objMetadata.offset;

    if (existingOffset != null) {
      return existingOffset;
    } else {
      const offset = this.ctl.insertBuffer(
        this.addObjectToOutputFiles(objMetadata.obj)
      );
      objMetadata.offset = offset;
      return offset;
    }
  }

  addObjectToOutputFiles(obj) {
    switch (obj.type) {
      case 'bank': {
        const data = {
          ...obj.value,
          pad: 0, // required padding field
          percussion: obj.value.percussionDefault
            ? this.dependOnReferencedObject({
                reference: obj.value.percussionDefault,
                type: 'instrument',
                field: 'percussionDefault',
                source: obj,
              })
            : 0,
          flags: FLAGS_REF_AS_OFFSET,
          instCount: Array.from(obj.value.instruments).length,
          instArray: Array.from(obj.value.instruments.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([instNumber, instrumentRef], index) => {
              if (index !== instNumber) {
                throw new Error(`missing instrument number ${index}`);
              }
              if (index < 0 || index > 127) {
                throw new Error(
                  `invalid instrument number ${index} outside range 0-127`
                );
              }

              return this.dependOnReferencedObject({
                reference: instrumentRef,
                type: 'instrument',
                field: 'instruments',
                source: obj,
              });
            }),
        };
        return ALBankStruct.serialize(data);
      }
      case 'instrument': {
        const data = {
          ...obj.value,
          flags: FLAGS_REF_AS_OFFSET,
          soundCount: obj.value.sounds.length,
          soundArray: obj.value.sounds.map((soundRef) =>
            this.dependOnReferencedObject({
              reference: soundRef,
              type: 'sound',
              field: 'sounds',
              source: obj,
            })
          ),
        };
        return ALInstrumentStruct.serialize(data);
      }
      case 'keymap': {
        return ALKeyMapStruct.serialize(obj.value);
      }
      case 'envelope': {
        return ALEnvelopeStruct.serialize(obj.value);
      }
      case 'wavetable': {
        const resolvedLocation = path.resolve(
          path.dirname(this.sourceFileLocation),
          obj.value.file
        );
        const aiffData = loadAIFFData(resolvedLocation);

        const isVADPCM = aiffData.formType === 'AIFC';

        const waveData = aiffData.soundData;
        const waveTblOffset = this.tbl.insertBuffer(waveData);
        let wavetableStructData;
        if (isVADPCM) {
          let loop = null;
          let book = null;

          aiffData.chunks.forEach((chunk) => {
            if (chunk.type !== 'APPL') return;
            let result = parseVADPCMApplDataField(chunk.value);
            if (result) {
              if (result.chunkName === VADPCM_CODE_NAME) {
                const {version, ...rest} = result.parsed;
                // the remaining properties of VADPCMBookChunkStruct are the
                // fields expected by ALADPCMBook
                book = rest;
              }
              if (result.chunkName === VADPCM_LOOP_NAME) {
                // only nloops===1 supported
                const vadpcmLoopChunkStruct = result.parsed;
                if (vadpcmLoopChunkStruct.nloops === 1) {
                  loop = vadpcmLoopChunkStruct.aloops[0];
                } else if (vadpcmLoopChunkStruct.nloops > 1) {
                  throw new Error(
                    `VADPCMLoopChunkStruct nloops has invalid value: ${vadpcmLoopChunkStruct.nloops}`
                  );
                }
              }
            }
          });

          if (!book)
            throw new Error(
              `could not extract VADPCM codebook from ${obj.value.file}`
            );

          wavetableStructData = {
            base: waveTblOffset,
            len: waveData.length,
            type: AL_ADPCM_WAVE,
            flags: FLAGS_REF_AS_OFFSET,
            waveInfo: {
              loop: loop
                ? this.ctl.insertBuffer(ALADPCMloopStruct.serialize(loop))
                : 0,
              book: this.ctl.insertBuffer(ALADPCMBookStruct.serialize(book)),
            },
          };
        } else {
          let loop = null;
          // extract loop definition from AIFF chunks
          const markersChunk = aiffData.chunks.find(
            (chunk) => chunk.type == 'MARK'
          );
          const instrumentChunk = aiffData.chunks.find(
            (chunk) => chunk.type == 'INST'
          );

          if (
            markersChunk &&
            instrumentChunk &&
            instrumentChunk.value.sustainLoop.playMode ==
              AIFF.LoopPlayMode.ForwardLooping
          ) {
            const loopStartMarkerID =
              instrumentChunk.value.sustainLoop.beginLoop;
            const loopEndMarkerID = instrumentChunk.value.sustainLoop.endLoop;

            const loopStartMarker = markersChunk.value.markers.find(
              (marker) => marker.id === loopStartMarkerID
            );
            const loopEndMarker = markersChunk.value.markers.find(
              (marker) => marker.id === loopEndMarkerID
            );
            if (loopStartMarker && loopEndMarker) {
              loop = {
                start: loopStartMarker.position,
                end: loopEndMarker.position,
                count: 0x7fffffff, // infinite, should be -1 but BufferStruct doesn't support underflow
              };
            }
          }
          wavetableStructData = {
            base: waveTblOffset,
            len: waveData.length,
            type: AL_RAW16_WAVE,
            flags: FLAGS_REF_AS_OFFSET,
            waveInfo: {
              loop: loop
                ? this.ctl.insertBuffer(ALRawLoopStruct.serialize(loop))
                : 0,
            },
          };
        }

        return ALWaveTableStruct.serialize(wavetableStructData);
      }
      case 'sound': {
        const data = {
          envelope: this.dependOnFieldReferencedObject({
            type: 'envelope',
            source: obj,
            field: 'envelope',
          }),
          keyMap: this.dependOnFieldReferencedObject({
            type: 'keymap',
            source: obj,
            field: 'keymap',
          }),
          wavetable: this.dependOnObject({
            type: 'wavetable',
            name: obj.value.file,
          }),
          samplePan: obj.value.pan,
          sampleVolume: obj.value.volume,
          flags: FLAGS_REF_AS_OFFSET,
        };
        return ALSoundStruct.serialize(data);
      }
      default:
        throw new Error(`unknown object type: ${obj.type}`);
        break;
    }
  }

  writeBankFile(filePrefix) {
    if (this.ctl.size !== 0) {
      throw new Error(`bank files built twice`);
    }
    const banks = Array.from(this.objects.get('bank').values());
    function makeHeader(banks) {
      return ALBankFileStruct.serialize({
        revision: Buffer.from([0x42, 0x31]),
        bankCount: banks.length,
        bankArray: banks,
      });
    }
    // make header with placeholders for bank offsets
    // insert as placeholder
    let bankFileHeader = makeHeader(banks.map((_) => 0));
    this.ctl.insertBuffer(bankFileHeader);
    // insert all the referenced file parts
    const banksOffsets = banks.map((bank) => this.dependOnObject(bank.obj));
    // replace header with corrected offsets
    bankFileHeader = makeHeader(banksOffsets);
    DEBUG &&
      console.log('bankFileHeader', bankFileHeader, {
        banksOffsets: banksOffsets.map((v) => v.toString(16)),
      });
    this.ctl.replaceBuffer(0, bankFileHeader);

    fs.writeFileSync(filePrefix + '.ctl', this.ctl.build());
    fs.writeFileSync(filePrefix + '.tbl', this.tbl.build());
  }
}

function sourceToBank(defs, sourceFileLocation) {
  const fileWriter = new ALBankFileWriter(defs, sourceFileLocation);
  return fileWriter;
}

module.exports = {
  bankToSource,
  sourceToBank,
  parseCtl,
  ALBankFileStruct,
  VADPCMApplDataFieldStruct,
  VADPCMBookChunkStruct,
  VADPCMLoopChunkStruct,
  VADPCM_CODE_NAME,
  VADPCM_LOOP_NAME,
  VADPCM_VERSION,
  isInvalidAIFFFromN64SDK,
  fixInvalidAIFFFromN64SDK,
};
