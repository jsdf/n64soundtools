import * as Tone from 'tone';

export function makeSampler() {
  const sampler = new Tone.Sampler({
    urls: {
      C3: '/Users/jfriend/.wine/drive_c/n64soundtools/example/sampleC2_01.aif',
    },
    release: 1,
    baseUrl: `${window.location.href}sample/`,
  }).toDestination();

  return Tone.loaded().then(() => sampler);
}

export function makePlayer() {
  const synths = [];

  const samplerPromise = makeSampler();

  function play(sampler, currentMidi) {
    const now = Tone.now() + 0.5;
    currentMidi.tracks.forEach((track) => {
      track.notes.forEach((note) => {
        sampler.triggerAttackRelease(
          note.name,
          note.duration,
          note.time + now,
          note.velocity
        );
      });
    });
  }
  function stop() {}

  return {play, stop, samplerPromise};
}
