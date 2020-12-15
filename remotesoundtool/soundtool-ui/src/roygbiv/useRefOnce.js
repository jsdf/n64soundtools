import React from 'react';

const {useRef} = React;
const UNINITIALZIED = {};
export default function useRefOnce(init) {
  const ref = useRef(UNINITIALZIED);
  if (ref.current === UNINITIALZIED) {
    ref.current = init();
  }
  return ref;
}
