import * as Tone from 'tone';
import {Midi as TonalMidi} from '@tonaljs/tonal';
import {Sampler} from './Sampler';

import midiparse from './midiparse';
import {midiCCsByName} from './midicc';

const USE_DEBUG_SYNTH = false;
const USE_DEBUG_SAMPLER = false;
const DEBUG = false;

export function makeSampler(config) {
  if (USE_DEBUG_SYNTH) {
    const synth = new Tone.PolySynth(Tone.Synth, {
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 1,
      },
    });
    return synth;
  } else {
    const sampler = USE_DEBUG_SAMPLER
      ? new Tone.Sampler({
          urls: {
            A0: 'A0.mp3',
            A1: 'A1.mp3',
            A2: 'A2.mp3',
            A3: 'A3.mp3',
            A4: 'A4.mp3',
            A5: 'A5.mp3',
            A6: 'A6.mp3',
            A7: 'A7.mp3',
          },
          release: 1,
          baseUrl: 'https://tonejs.github.io/audio/salamander/',
        })
      : new Sampler(
          config || {
            urls: {
              // C3: '/Users/jfriend/.wine/drive_c/n64soundtools/example/sampleC2_01.aif',
              C2:
                '/Users/jfriend/.wine/drive_c/n64soundtools/test/genmidi_samples/0.aiff',
            },
            release: 1,
            baseUrl: `${window.location.href}sample/`,
          }
        );
    return sampler;
  }
}

let idCounter = 0;
export function makePlayer(configs) {
  Tone.Master.volume.setValueAtTime(-30, Tone.now());
  const id = idCounter++;
  const samplers = configs
    ? Object.entries(configs).map(([number, config]) => {
        const sampler = makeSampler(config);
        sampler.name = 'Instrument' + number;
        return sampler;
      })
    : [makeSampler()];
  const instruments = samplers.map((sampler, index) => {
    const instrument = new Tone.Channel({}).toDestination();

    samplers[index].connect(instrument);
    return instrument;
  });
  const channels = new Array(16).fill(0);
  channels[9] = 128; // drum

  let samplesLoaded = false;
  Tone.loaded().then(() => {
    samplesLoaded = true;
    console.log('all samples loaded');
  });
  const startTime = performance.now() - Tone.now() * 1000;
  const midiOut = {
    id: 'WebAudioSampler' + id,
    name: 'WebAudio Sampler',
    samplers,
    send(midiBytes, time) {
      DEBUG &&
        console.log(
          'WebAudioSampler',
          midiBytes.map((b) => b.toString(16)),
          time
        );
      const audioCtxTime = Math.max(0, (time - startTime) / 1000);
      const eventType = midiparse.getEventType(midiBytes[0]);
      const channel = midiparse.getChannel(midiBytes[0]);
      const samplerForChannel = samplers[channels[channel]] || samplers[0];
      switch (eventType) {
        case 'noteOn':
          if (!samplesLoaded) return;
          DEBUG &&
            console.log(eventType, TonalMidi.midiToNoteName(midiBytes[1]), {
              channel,
              samplerForChannel,
              audioCtxTime,
              now: Tone.now(),
            });
          samplerForChannel.triggerAttack(
            TonalMidi.midiToNoteName(midiBytes[1]),
            audioCtxTime,
            midiBytes[2] / 127 // velocity
          );
          break;
        case 'noteOff':
          if (!samplesLoaded) return;
          samplerForChannel.triggerRelease(
            TonalMidi.midiToNoteName(midiBytes[1]),
            audioCtxTime
          );
          break;
        case 'programChange':
          console.log('programChange', channel, midiBytes[1]);
          channels[channel] = midiBytes[1];
          break;
        case 'controlChange':
          switch (midiBytes[1]) {
            case midiCCsByName.volumecoarse:
              if (samplers[channels[channel]]) {
                // https://music.arts.uci.edu/dobrian/maxcookbook/midi-mapping-amplitude
                samplers[channels[channel]].set(
                  'volume',
                  (midiBytes[2] / 127) * 70 - 70
                );
              }
              break;
            case midiCCsByName.pancoarse:
              if (samplers[channels[channel]]) {
                samplers[channels[channel]].set('pan', midiBytes[2] / 127);
              }
              break;
            default:
              break;
          }
          break;
        default:
          return;
      }
    },
  };

  return {
    midiOut,
    samplers,
    channels,
    dispose: () => {
      samplers.forEach((sampler) => sampler.dispose());
      instruments.forEach((channel) => channel.dispose());
    },
  };
}
