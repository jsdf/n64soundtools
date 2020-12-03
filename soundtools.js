const fs = require('fs').promises;

const AIFF = require('./aiff');
const {BufferStruct, BufferStructUnion} = require('./bufferstruct');

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

async function bankToSource() {
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
  console.log(
    'bankFile.instruments',
    Object.values(bankFile.instruments).slice(0, 4)
  );

  bankFile.sounds = {};
  Object.values(bankFile.instruments).forEach((instrument) => {
    instrument.soundArray.forEach((offset) => {
      bankFile.sounds[offset] = ALSoundStruct.parse(ctlBuffer, offset);
    });
  });
  console.log('bankFile.sounds', Object.values(bankFile.sounds).slice(0, 4));

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
  console.log(
    'bankFile.envelopes',
    Object.values(bankFile.envelopes).slice(0, 4)
  );
  console.log('bankFile.keyMaps', Object.values(bankFile.keyMaps).slice(0, 4));
  console.log(
    'bankFile.wavetables',
    Object.values(bankFile.wavetables).slice(0, 4)
  );
  await Promise.all(
    Object.keys(bankFile.wavetables).map((offset) => {
      const aSampleTable = bankFile.wavetables[offset];
      const pcm16BitData = tblBuffer.slice(
        aSampleTable.base,
        aSampleTable.base + aSampleTable.len
      );

      const aiffFileContents = AIFF.serialize({
        soundData: pcm16BitData,
        numChannels: 1,
        sampleSize: 16,
        sampleRate: 44100,
      });
      return fs.writeFile('testwav/' + offset + '.aifc', aiffFileContents);
    })
  );
}

async function sourceToBank() {
  const data = require('./piano-inst');
  // TODO
}

// bankToSource();
