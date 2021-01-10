import {useEffect, useState, useCallback} from 'react';
import {Scale as TonalScale, Midi as TonalMidi} from '@tonaljs/tonal';

import {clamp} from './flatland/mathUtils';

const qwerty = "asdfghjkl;'".split('');

function getQwertyOffset(key) {
  const index = qwerty.indexOf(key);
  if (index > -1) {
    return index;
  }
  return null;
}

const scaleNotes = TonalScale.get('C major').notes; // =>["C", "D", "E", "F", "G", "A", "B"];
const minOctave = 0;
const maxOctave = 7;

export function useKeyboard(instrument) {
  const [octave, setOctave] = useState(2);

  const qwertyToNoteName = useCallback(
    (key) => {
      const qwertyOffset = getQwertyOffset(key);
      if (qwertyOffset == null) {
        return null;
      }

      const pitchClass = scaleNotes[qwertyOffset % scaleNotes.length];
      const octaveOffset = Math.floor(qwertyOffset / scaleNotes.length);

      return pitchClass + clamp(octave + octaveOffset, minOctave, maxOctave);
    },
    [octave]
  );

  useEffect(() => {
    console.log(module.id, 'useEffect');
    const qwertyHandlers = {
      onKeyDown(e) {
        if (e.repeat) return;
        const noteName = qwertyToNoteName(e.key);
        if (noteName != null) {
          instrument.send(
            [0x90, TonalMidi.toMidi(noteName), 64],
            performance.now()
          );
        }
        switch (e.key) {
          case 'z':
            setOctave((s) => Math.max(s - 1, 0));
            break;
          case 'x':
            setOctave((s) => Math.min(s + 1, 7));
            break;
          default:
            break;
        }
      },
      onKeyUp(e) {
        const noteName = qwertyToNoteName(e.key);
        if (noteName != null) {
          instrument.send(
            [0x80, TonalMidi.toMidi(noteName), 0],
            performance.now()
          );
        }
      },
    };

    document.addEventListener('keydown', qwertyHandlers.onKeyDown);
    document.addEventListener('keyup', qwertyHandlers.onKeyUp);
    return () => {
      document.removeEventListener('keydown', qwertyHandlers.onKeyDown);
      document.removeEventListener('keyup', qwertyHandlers.onKeyUp);
    };
  }, [instrument, qwertyToNoteName]);
}

export function Keyboard({instrument}) {
  useKeyboard(instrument);

  return null;
}
