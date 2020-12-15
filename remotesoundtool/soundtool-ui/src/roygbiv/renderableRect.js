export function getIntersectingRenderedRect(point, renderedRects) {
  let intersecting = null;

  // iterate in reverse to visit frontmost rects first
  for (var i = renderedRects.length - 1; i >= 0; i--) {
    const renderedRect = renderedRects[i];

    const intersection = renderedRect.rect.containsPoint(point);
    if (intersection) {
      // clicked on this rect
      intersecting = renderedRect;
      break;
    }
  }

  return intersecting;
}

export function getIntersectingEvent(point, renderedRects) {
  let intersecting = getIntersectingRenderedRect(point, renderedRects);
  if (intersecting) {
    return intersecting.object;
  }

  return null;
}

export function findIntersectingEvents(rect, renderedRects) {
  let intersecting = [];
  // iterate in reverse to visit frontmost rects first
  for (var i = renderedRects.length - 1; i >= 0; i--) {
    const renderedRect = renderedRects[i];

    const intersection = renderedRect.rect.intersectsRect(rect);
    if (intersection) {
      // clicked on this rect
      intersecting.push(renderedRect.object);
    }
  }

  return intersecting;
}
