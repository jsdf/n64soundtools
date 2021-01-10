import * as Tone from 'tone';
import {Midi as TonalMidi} from '@tonaljs/tonal';

import midiparse from './midiparse';
const USE_DEBUG_SYNTH = false;
const USE_DEBUG_SAMPLER = false;

export function makeSampler() {
  if (USE_DEBUG_SYNTH) {
    const synth = new Tone.PolySynth(Tone.Synth, {
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 1,
      },
    }).toDestination();
    return Promise.resolve(synth);
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
        }).toDestination()
      : new Tone.Sampler({
          urls: {
            C3:
              '/Users/jfriend/.wine/drive_c/n64soundtools/example/sampleC2_01.aif',
          },
          release: 1,
          baseUrl: `${window.location.href}sample/`,
        }).toDestination();

    return Tone.loaded().then(() => sampler);
  }
}

let idCounter = 0;
export function makePlayer() {
  // preload samples
  const defaultSamplerPromise = makeSampler();
  let defaultSampler;
  const id = idCounter++;
  const startTime = performance.now() - Tone.now() * 1000;
  const midiOut = {
    id: 'WebAudio' + id,
    name: 'WebAudio Sampler',
    send(midiBytes, time) {
      const audioCtxTime = (time - startTime) / 1000;
      const eventType = midiparse.getEventType(midiBytes[0]);
      switch (eventType) {
        case 'noteOn':
          defaultSampler.triggerAttack(
            TonalMidi.midiToNoteName(midiBytes[1]),
            audioCtxTime,
            midiBytes[2] / 0x7f // velocity
          );
          break;
        case 'noteOff':
          defaultSampler.triggerRelease(
            TonalMidi.midiToNoteName(midiBytes[1]),
            audioCtxTime
          );
          break;
        default:
          return;
      }
    },
  };

  defaultSamplerPromise.then((sampler) => {
    defaultSampler = sampler;
  });

  return {
    midiOut,
  };
}
