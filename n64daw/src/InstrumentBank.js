import {Midi as TonalMidi} from '@tonaljs/tonal';

function getInstrumentRef(ref, type, objects) {
  if (ref.type !== 'symbol') throw new Error(`not a symbol`, ref);
  return objects.get(type).get(ref.value);
}
function makeInstrumentConfig(
  instrumentObj,
  instNumber,
  objects,
  sourceFileDir
) {
  const sounds = instrumentObj.sounds.map((soundRef) => {
    const sound = getInstrumentRef(soundRef, 'sound', objects);
    const keymap = getInstrumentRef(sound.keymap, 'keymap', objects);
    const envelope = getInstrumentRef(sound.envelope, 'envelope', objects);

    return {...sound, keymap, envelope};
  });

  const samplerConfig = {
    urls: {
      // C2: 'genmidi_samples/0.aiff',
    },
    baseUrl: `${window.location.href}sample/${sourceFileDir}/`,
  };

  sounds.forEach((sound) => {
    samplerConfig.urls[TonalMidi.midiToNoteName(sound.keymap.keyBase)] =
      sound.file;

    if (sound.envelope.attackTime != null) {
      samplerConfig.attack = sound.envelope.attackTime / 1000000;
    }
    if (sound.envelope.releaseTime) {
      samplerConfig.release = sound.envelope.releaseTime / 1000000;
    }
  });

  return samplerConfig;
}

export function makeInstrumentConfigs({defs, sourceFileDir}) {
  const objects = new Map(
    [
      'bank',
      'instrument',
      'sound',
      'keymap',
      'envelope',
      'wavetable',
    ].map((key) => [key, new Map()])
  );

  defs.forEach((obj) => {
    objects.get(obj.type).set(obj.name, obj.value);
  });

  const bank = [...objects.get('bank').values()][0];
  return Object.fromEntries(
    Object.entries(bank.instruments)
      .map(([number, inst]) => [
        number,
        makeInstrumentConfig(
          getInstrumentRef(inst, 'instrument', objects),
          number,
          objects,
          sourceFileDir
        ),
      ])
      .concat(
        bank.percussionDefault
          ? [
              [
                128,
                makeInstrumentConfig(
                  getInstrumentRef(
                    bank.percussionDefault,
                    'instrument',
                    objects
                  ),
                  128,
                  objects,
                  sourceFileDir
                ),
              ],
            ]
          : []
      )
  );
}
