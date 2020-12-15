import Vector2 from './Vector2';

// get mouse event pos relative to some element (typically the viewport canvas)
export function getMouseEventPos(event, canvas) {
  var rect = canvas.getBoundingClientRect();
  return new Vector2({
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  });
}
