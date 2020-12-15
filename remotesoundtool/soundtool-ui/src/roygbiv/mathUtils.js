export function wrap(value, max) {
  return ((value % max) + max) % max;
}
