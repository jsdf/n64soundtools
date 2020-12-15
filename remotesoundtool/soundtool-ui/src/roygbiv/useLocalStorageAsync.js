import {useState, useRef, useEffect} from 'react';

// like throttle, but calls with last args provided instead of first
function throttleTrailing(fn, time) {
  let timeout = null;
  let timeoutFn = null;
  let lastArgs = null;
  function throttled(...args) {
    lastArgs = args;
    if (timeout == null) {
      timeoutFn = () => {
        if (lastArgs) {
          fn(...lastArgs);
        }
        timeout = null;
        timeoutFn = null;
      };
      timeout = setTimeout(timeoutFn, time);
    }
  }

  throttled.flush = () => {
    clearTimeout(timeout);
    timeout = null;
    if (timeoutFn) {
      timeoutFn();
      timeoutFn = null;
    }
  };
  return throttled;
}

function getInitialState(value) {
  return typeof value === 'function' ? value() : value;
}
export default function useLocalStorageAsync(stateKey, initialValue, options) {
  const key = `${
    (options?.baseKey ?? 'useLocalStorageAsync') +
    (options?.schemaVersion != null ? `:v${options.schemaVersion}` : '')
  }:${stateKey}`;

  const storeValueRef = useRef(null);
  if (!storeValueRef.current) {
    const doStore = (valueToStore) => {
      const serialized = options?.stringify
        ? options.stringify(valueToStore)
        : JSON.stringify(valueToStore);

      // Save to local storage
      if (serialized) {
        window.localStorage.setItem(key, serialized);
        // console.log('stored', key, serialized);
      }
    };

    storeValueRef.current = throttleTrailing(doStore, 500);
  }
  useEffect(() => {
    const cleanup = () => {
      if (storeValueRef.current) {
        // do any pending store
        storeValueRef.current.flush();
      }
    };

    window.addEventListener('beforeunload', cleanup);
    // force write on unmount
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  }, []);
  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  const [storedValue, setStoredValue] = useState(() => {
    try {
      // Get from local storage by key
      const item = window.localStorage.getItem(key);

      // Parse stored json or if none return initialValue
      const parsed = item
        ? options?.parse
          ? options.parse(item)
          : JSON.parse(item)
        : null;

      const loaded = parsed ?? getInitialState(initialValue);
      // console.log('loaded', key, loaded);
      return loaded;
    } catch (error) {
      // If error also return initialValue
      console.error(error);
      window.localStorage.removeItem(key);
      return getInitialState(initialValue);
    }
  });

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      // Save state
      setStoredValue(valueToStore);

      storeValueRef.current(valueToStore);
    } catch (error) {
      // A more advanced implementation would handle the error case
      console.log(error);
    }
  };

  return [storedValue, setValue];
}
