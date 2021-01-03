import {range, scaleDiscreteQuantized} from './flatland/utils';
export const midiNotesRange = range(127);

export function getExtents(events) {
  if (events.length === 0) {
    return {
      start: 0,
      end: 0,
      size: 0,
      minMidi: 0,
      maxMidi: midiNotesRange.length - 1,
    };
  }

  const minMidi = events.reduce(
    (acc, ev) => Math.min(acc, ev.midi),
    midiNotesRange.length - 1
  );
  const maxMidi = events.reduce((acc, ev) => Math.max(acc, ev.midi), 0);

  const start = events.reduce((acc, ev) => Math.min(acc, ev.time), Infinity);
  const end = events.reduce(
    (acc, ev) => Math.max(acc, ev.time + ev.duration),
    -Infinity
  );
  return {
    start,
    end,
    size: end - start,
    minMidi,
    maxMidi,
  };
}
