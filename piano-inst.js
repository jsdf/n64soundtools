module.exports = {
  instruments: {
    piano: {
      volume: 127,
      pan: 64,
      priority: 5,
      flags: 0,
      tremType: 0,
      tremRate: 0,
      tremDepth: 0,
      tremDelay: 0,
      vibType: 0,
      vibRate: 0,
      vibDepth: 0,
      vibDelay: 0,
      bendRange: 200,
      // soundCount: 1,
      // soundArray: [64],
      sounds: ['pianoc2'],
    },
  },
  sounds: {
    pianoc2: {
      envelope: 'piano',
      keyMap: 'piano',
      wavetable: 'pianoc2',
      samplePan: 64,
      sampleVolume: 127,
      flags: 0,
    },
  },
  keymaps: {
    piano: {
      velocityMin: 0,
      velocityMax: 127,
      keyMin: 0,
      keyMax: 127,
      keyBase: 48,
      detune: 0,
    },
  },
  envelopes: {
    piano: {
      attackTime: 0,
      decayTime: 4000000,
      releaseTime: 200000,
      attackVolume: 32512,
      decayVolume: 0,
    },
  },
  wavetables: {
    pianoc2: {
      file: './sampleC2.aif',
    },
  },
};
