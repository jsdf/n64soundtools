const fs = require('fs').promises;

const ieeeExtended = require('./ieeeextended');

function nullthrows(value, message) {
  if (value == null) {
    throw new Error('unexpected null' + (message ? ': ' + message : ''));
  }
  return value;
}

const BufferStructFieldTypesToBufferMethods = {
  uint: 'UInt',
  int: 'Int',
  float: 'Float',
  double: 'Double',
  bigint: 'BigInt',
  biguint: 'BigUint',
  char: 'UInt',
};

function getBufferMethodName(type, size, endian) {
  return `${BufferStructFieldTypesToBufferMethods[type]}${size * 8}${
    size == 1 ? '' : endian == 'big' ? 'BE' : 'LE'
  }`;
}

function getAlignedSize(size, alignment) {
  return Math.ceil(size / alignment) * alignment;
}

function getAlignedSizeForField(field, size) {
  return field.align != null ? getAlignedSize(size, field.align) : size;
}

class BufferStruct {
  constructor(schema) {
    this.schema = schema;
    this.offset = 0;
  }

  parse(buffer, startOffset) {
    const result = {};
    let offset = startOffset || 0;
    function advance(methodName) {
      const value = buffer[`read${methodName}`](this.offset);
      offset += size;
      return value;
    }
    Object.keys(this.schema.fields).forEach((fieldName) => {
      const {field, endian, size, type} = this._getFieldConfig(
        fieldName,
        result
      );

      const parse =
        type === 'bytes'
          ? (buffer, startOffset) => {
              if (size == null) {
                throw new Error(
                  `can't parse field of type 'bytes' without predetermined size`
                );
              }
              const value = buffer.slice(startOffset, startOffset + size);
              return {value, parsedSize: size};
            }
          : type instanceof BufferStruct
          ? (buffer, startOffset) => {
              const value = type.parse(buffer, startOffset);
              // use static size where determined (eg. in case of union)
              const parsedSize =
                size != null ? size : type.offset - startOffset; // change in offset after parsing

              return {value, parsedSize};
            }
          : (buffer, startOffset) => {
              const methodName = `read${getBufferMethodName(
                type,
                size,
                endian
              )}`;

              const value = buffer[methodName](startOffset);
              if (this.schema.traceReads) {
                console.log(methodName, {
                  fieldName,
                  type,
                  size,
                  endian,
                  startOffset,
                  value,
                });
              }

              return {value, parsedSize: size};
            };

      // the ability to provide predetermined size, as well as define alignment, means we need to account for either of these
      // sources of padding when advancing the point we are reading in the buffer
      const parseWithAlignment = (buffer, startOffset) => {
        const {value, parsedSize} = parse(buffer, startOffset);

        if (size != null && parsedSize > size) {
          throw new Error(
            `parsed size ${parsedSize} larger than predetermined size ${size} for field ${fieldName} on ${this.getName()}`
          );
        }

        // when field is aligned we must make sure to advance by aligned size
        // additionally, if a predetermined size is set, we should use that size instead (in case of padding)
        // we have already asserted above that the parsed size is not larger than the predetermined size
        let parsedSizeWithAlignment = getAlignedSizeForField(
          field,
          size != null ? parsedSize : size
        );

        if (size != null && parsedSizeWithAlignment > size) {
          throw new Error(
            `aligned parsed size ${parsedSize} larger than predetermined size ${size} for field ${fieldName} on ${this.getName()}`
          );
        }

        return {value, consumedSize: parsedSizeWithAlignment};
      };

      try {
        if (field.arrayElements) {
          // array field
          const count =
            typeof field.arrayElements === 'function'
              ? field.arrayElements(result)
              : field.arrayElements;
          const array = new Array(count);

          for (var i = 0; i < count; ++i) {
            const {value, consumedSize} = parseWithAlignment(buffer, offset);

            offset += consumedSize;
            array[i] = value;
          }

          result[fieldName] = array;
        } else {
          // non-array field
          const {value, consumedSize} = parseWithAlignment(buffer, offset);
          offset += consumedSize;
          result[fieldName] = value;
        }
      } catch (error) {
        throw new Error(
          `failed parsing field ${fieldName} on ${this.getName()}: ${error}`
        );
      }
    });
    this.offset = offset;
    return result;
  }

  _getFieldConfig(fieldName, partialResult) {
    const field = nullthrows(
      this.schema.fields[fieldName],
      `${fieldName} schema is missing`
    );
    const endian = field.endian || this.schema.endian || 'little';
    const type = nullthrows(field.type, `${fieldName} type`);
    if (
      !(
        type instanceof BufferStruct ||
        type instanceof BufferStructUnion ||
        type in BufferStructFieldTypesToBufferMethods ||
        type === 'bytes'
      )
    ) {
      throw new Error(`unsupported type ${type} in ${fieldName}`);
    }

    // use statically defined size if we've got it
    let size =
      typeof field.size === 'function' ? field.size(partialResult) : field.size;
    if (type === 'bytes') {
      // allow size to be dynamic
    } else if (type instanceof BufferStruct) {
      // allow size to be dynamic
    } else if (type instanceof BufferStructUnion) {
      // size will be statically known (asserted in BufferStructUnion)
      size = type.size;
    } else {
      // size must be statically known
      size = nullthrows(size, `${fieldName} size`);
    }

    let actualType = type;
    // replace union type with actual type
    if (type instanceof BufferStructUnion) {
      actualType = type.selectMember(partialResult);
      if (actualType == null) {
        throw new Error(
          `failed to refine union type in field ${fieldName} on ${this.getName()}`
        );
      }
    }

    return {field, endian, size, type: actualType};
  }

  serialize(data) {
    const parts = [];
    Object.keys(this.schema.fields).forEach((fieldName) => {
      const {field, endian, size, type} = this._getFieldConfig(fieldName, data);

      if (!(fieldName in data)) {
        throw new Error(
          `missing field ${fieldName} when serializing ${this.getName()}`
        );
      }
      const value = data[fieldName];

      const serialize =
        type === 'bytes'
          ? (value) => {
              const dynSize = size == null ? value.length : size;
              const partBuffer = Buffer.alloc(dynSize);
              value.copy(partBuffer, 0, 0, dynSize);

              return partBuffer;
            }
          : type instanceof BufferStruct
          ? (value) => type.serialize(value)
          : (value) => {
              const methodName = `write${getBufferMethodName(
                type,
                size,
                endian
              )}`;

              const partBuffer = Buffer.alloc(size);
              partBuffer[methodName](value);
              if (this.schema.traceWrites) {
                console.log(methodName, {
                  fieldName,
                  type,
                  size,
                  endian,
                  value,
                });
              }

              return partBuffer;
            };

      const serializeWithAlignment = (value) => {
        const partBuffer = serialize(value);
        const serializedSize = partBuffer.length;
        if (size != null && serializedSize > size) {
          throw new Error(
            `serialized size ${parsedSize} larger than predetermined size ${size} for field ${fieldName} on ${this.getName()}`
          );
        }

        let maybeAlignedPartBuffer = partBuffer;
        if (field.align != null) {
          const alignedSerializedSize = getAlignedSize(
            serializedSize,
            field.align
          );
          const alignedExpectedSize = getAlignedSize(size, field.align);
          if (alignedSerializedSize > alignedExpectedSize)
            throw new Error(
              `serialized aligned size ${
                maybeAlignedPartBuffer.length
              } larger than predetermined size (aligned) ${alignedExpectedSize} for field ${fieldName} on ${this.getName()}`
            );

          const partBufferAligned = Buffer.alloc(alignedSerializedSize);
          partBuffer.copy(partBufferAligned);
          maybeAlignedPartBuffer = partBufferAligned;
        }

        return maybeAlignedPartBuffer;
      };

      try {
        if (field.arrayElements) {
          for (var i = 0; i < value.length; ++i) {
            const part = serializeWithAlignment(value[i]);
            parts.push(part);
          }
        } else {
          const part = serializeWithAlignment(value);
          parts.push(part);
        }
      } catch (error) {
        throw new Error(`failed serializing field ${fieldName}: ${error}`);
      }
    });

    return Buffer.concat(parts);
  }

  getStaticSize() {
    let size = 0;
    for (const field of Object.values(this.schema.fields)) {
      if (typeof field.size != 'number') {
        throw new Error('cannot get static size of struct: ' + this.getName());
        const alignedFieldSize = getAlignedSizeForField(field, field.size);
        size += alignedFieldSize;
      }
    }
    return size;
  }

  getName() {
    return this.schema.name || this.constructor.name;
  }
}

// simulates c struct union functionality, using the provided selectMember function
// to choose which union member (BufferStruct) to interpret data as based on previously parsed fields.
// requires that all union members have statically determinable size (eg. no arrays or dynamically sized bytes fields allowed)
class BufferStructUnion {
  constructor({members, selectMember}) {
    this.selectMember = selectMember;
    this.members = members;
    this.size = Math.max(...members.map((m) => m.getStaticSize()));
  }
}

// end BufferStruct code

const AL_ADPCM_WAVE = 0;
const AL_RAW16_WAVE = 1;

// typedef struct {
//         s16     revision;
//         s16     bankCount;
//         s32     bankArray[1];
// } ALBankFile;
const ALBankFileStruct = new BufferStruct({
  name: 'ALBankFile',
  endian: 'big',
  fields: {
    revision: {type: 'int', size: 2},
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
    envelope: {type: 'int', size: 4},
    keyMap: {type: 'int', size: 4},
    wavetable: {type: 'int', size: 4},
    samplePan: {type: 'uint', size: 1},
    sampleVolume: {type: 'uint', size: 1},
    flags: {type: 'uint', size: 1},
  },
});

// typedef struct {
//         s32     attackTime;
//         s32     decayTime;
//         s32     releaseTime;
//         s16     attackVolume;
//         s16     decayVolume;
// } ALEnvelope;

const ALEnvelopeStruct = new BufferStruct({
  name: 'ALEnvelope',
  endian: 'big',
  fields: {
    attackTime: {type: 'int', size: 4},
    decayTime: {type: 'int', size: 4},
    releaseTime: {type: 'int', size: 4},
    attackVolume: {type: 'int', size: 2},
    decayVolume: {type: 'int', size: 2},
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

// AIFF stuff
// http://paulbourke.net/dataformats/audio/
// http://www-mmsp.ece.mcgill.ca/Documents/AudioFormats/AIFF/Docs/AIFF-1.3.pdf
const AIFFChunkStruct = new BufferStruct({
  name: 'AIFFChunk',
  endian: 'big',
  fields: {
    ckID: {type: 'bytes', size: 4},
    ckSize: {type: 'int', size: 4},
    chunkData: {type: 'bytes', align: 2, size: (fields) => fields.ckSize},
  },
});

// short numChannels;
// unsigned long numSampleFrames;
// short sampleSize;
// extended sampleRate;
const AIFFCommDataStruct = new BufferStruct({
  name: 'AIFFCommData',
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
const AIFFSoundDataStruct = new BufferStruct({
  name: 'AIFFSoundData',
  endian: 'big',
  fields: {
    offset: {type: 'uint', size: 4},
    blockSize: {type: 'uint', size: 4},
  },
});

function makeAIFFChunk(ckID, chunkData) {
  if (ckID === 'COMM' && chunkData.length !== 18) {
    throw new Error('invalid COMM chunk size:', chunkData.length);
  }

  return AIFFChunkStruct.serialize({
    ckID: Buffer.from(ckID, 'utf8'),
    ckSize: chunkData.length,
    chunkData,
  });
}

async function run() {
  const ctlBuffer = await fs.readFile(
    '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/soundbanks/GenMidiRaw.ctl'
    // '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/soundbanks/sfx.ctl'
  );
  const tblBuffer = await fs.readFile(
    '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/soundbanks/GenMidiRaw.tbl'
    // '/Users/jfriend/.wine/drive_c/ultra/usr/lib/PR/soundbanks/sfx.tbl'
  );

  const bankFile = ALBankFileStruct.parse(ctlBuffer);

  console.log('bankFile', bankFile);

  bankFile.banks = {};
  bankFile.bankArray.forEach((offset) => {
    bankFile.banks[offset] = ALBankStruct.parse(ctlBuffer, offset);
  });
  console.log('bankFile.banks', bankFile.banks);

  bankFile.instruments = {};
  Object.values(bankFile.banks).forEach((bank) => {
    bank.instArray.forEach((offset) => {
      bankFile.instruments[offset] = ALInstrumentStruct.parse(
        ctlBuffer,
        offset
      );
    });
  });
  // console.log('bankFile.instruments', bankFile.instruments);

  bankFile.sounds = {};
  Object.values(bankFile.instruments).forEach((instrument) => {
    instrument.soundArray.forEach((offset) => {
      bankFile.sounds[offset] = ALSoundStruct.parse(ctlBuffer, offset);
    });
  });
  // console.log('bankFile.sounds', bankFile.sounds);

  bankFile.envelopes = {};
  bankFile.keyMaps = {};
  bankFile.wavetables = {};
  Object.values(bankFile.sounds).forEach((sound) => {
    bankFile.envelopes[sound.envelope] =
      bankFile.envelopes[sound.envelope] ||
      ALEnvelopeStruct.parse(ctlBuffer, sound.envelope);
    bankFile.keyMaps[sound.keyMap] =
      bankFile.keyMaps[sound.keyMap] ||
      ALKeyMapStruct.parse(ctlBuffer, sound.keyMap);
    bankFile.wavetables[sound.wavetable] =
      bankFile.wavetables[sound.wavetable] ||
      ALWaveTableStruct.parse(ctlBuffer, sound.wavetable);
  });
  // console.log('bankFile.envelopes', bankFile.envelopes);
  // console.log('bankFile.keyMaps', bankFile.keyMaps);
  // console.log('bankFile.wavetables', bankFile.wavetables);
  await Promise.all(
    Object.keys(bankFile.wavetables).map((offset) => {
      const aSampleTable = bankFile.wavetables[offset];
      console.log(aSampleTable);
      const wav = tblBuffer.slice(
        aSampleTable.base,
        aSampleTable.base + aSampleTable.len
      );

      const nsamples = Math.floor(wav.length / 2);

      const commChunk = makeAIFFChunk(
        'COMM',
        AIFFCommDataStruct.serialize({
          numChannels: 1,
          numSampleFrames: nsamples,
          sampleSize: 16,
          sampleRate: Buffer.from('400EAC44000000000000', 'hex'), // 44100hz
        })
      );

      const soundDataChunk = makeAIFFChunk(
        'SSND',
        Buffer.concat([
          AIFFSoundDataStruct.serialize({
            offset: 0,
            blockSize: 0,
          }),
          /*soundData*/ wav,
        ])
      );

      return fs.writeFile(
        'testwav/' + offset + '.aifc',

        makeAIFFChunk(
          'FORM',
          Buffer.concat([
            /*formType*/ Buffer.from('AIFF', 'utf8'),
            commChunk,
            soundDataChunk,
          ])
        )
      );
    })
  );
}

run();
