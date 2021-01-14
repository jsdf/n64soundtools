import {useEffect, useRef, useState} from 'react';
import SelectWithLabel from './SelectWithLabel';

// this is actually kind of complicated because we need to call an API that
// returns a promise (requestMIDIAccess) AND also subscribe an event listener to
// the thing returned by that promise. to correctly update the closed-over values
// in the handler for that event listener, we need the extra indirection of a ref
export default function MidiPortSelector({
  direction,
  port,
  onChange,
  extraPorts,
}) {
  const [ports, setPorts] = useState([]);
  const midiAccessRef = useRef(null);
  const onStateChangeRef = useRef(null);

  useEffect(() => {
    onStateChangeRef.current = function onStateChange() {
      const midiAccess = midiAccessRef.current;
      if (!midiAccess) return;
      const midiPorts = midiAccess[direction === 'in' ? 'inputs' : 'outputs'];
      const newPorts = [...(extraPorts || []), ...midiPorts.values()];
      setPorts(newPorts);
      if (port) {
        // if current port is invalid, choose first
        if (!newPorts.find((newPort) => newPort.id === port.id)) {
          onChange(newPorts[0]);
        }
      } else {
        if (newPorts.length) {
          onChange(newPorts[0]);
        }
      }
    };
    return () => {
      onStateChangeRef.current = null;
    };
  }, [direction, extraPorts, port, port?.id, onChange]);

  useEffect(() => {
    if (onStateChangeRef.current) onStateChangeRef.current();
  }, [extraPorts]);

  useEffect(() => {
    function handleStateChange() {
      if (onStateChangeRef.current) onStateChangeRef.current();
    }

    navigator.requestMIDIAccess().then((midiAccess) => {
      midiAccessRef.current = midiAccess;
      midiAccessRef.current.addEventListener('statechange', handleStateChange);
      // init
      handleStateChange();
    });

    return () => {
      if (midiAccessRef.current) {
        midiAccessRef.current.removeEventListener(
          'statechange',
          handleStateChange
        );
        midiAccessRef.current = null;
      }
    };
  }, []);

  return (
    <SelectWithLabel
      label="Midi Out"
      options={[...ports.values()].map((v) => ({value: v.id, label: v.name}))}
      value={port?.id}
      onChange={(id) => {
        onChange(ports.find((port) => port.id === id));
      }}
    />
  );
}
