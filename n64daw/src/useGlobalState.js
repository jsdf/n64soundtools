import {useState, useCallback} from 'react';

const state = new Map();

export default function useGlobalState(name, initializer) {
  if (!state.has(name)) {
    state.set(
      name,
      typeof initializer === 'function' ? initializer() : initializer
    );
  }

  const [localState, setLocalState] = useState(() => state.get(name));

  const setGlobalState = useCallback(
    function setGlobalState(value) {
      state.set(name, value);
      setLocalState(() => value);
    },
    [name]
  );

  return [localState, setGlobalState];
}
