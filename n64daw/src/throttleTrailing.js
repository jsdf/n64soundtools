// like throttle, but calls with last args provided instead of first
export default function throttleTrailing(fn, time) {
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
