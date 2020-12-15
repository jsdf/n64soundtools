import React from 'react';
const {useEffect, useState, useRef} = React;

export function useCanvasContext2d() {
  const canvasRef = useRef(null);
  const [state, setState] = useState(null);

  useEffect(() => {
    if (canvasRef.current && (!state || state.canvas !== canvasRef.current)) {
      const ctx = canvasRef.current?.getContext('2d');
      setState({
        canvas: canvasRef.current,
        ctx,
      });
    }
  }, [state]);

  return {canvasRef, ctx: state?.ctx, canvas: state?.canvas};
}

const defaultStyle = {
  strokeStyle: 'transparent',
  fillStyle: 'transparent',
};

const defaultTextStyle = {
  font: '12px Lucida Grande',
};

export function drawRect(ctx, rect, attrs) {
  Object.assign(ctx, defaultStyle, attrs);

  if (attrs.fillStyle) {
    ctx.fillRect(
      Math.floor(rect.position.x),
      Math.floor(rect.position.y),
      Math.floor(rect.size.x),
      Math.floor(rect.size.y)
    );
  }
  if (attrs.strokeStyle) {
    ctx.strokeRect(
      Math.floor(rect.position.x),
      Math.floor(rect.position.y),
      Math.max(Math.floor(rect.size.x - 1), 0),
      Math.max(Math.floor(rect.size.y - 1, 0))
    );
  }
}

export function drawTextRect(ctx, text, rect, attrs, props) {
  ctx.save();
  Object.assign(ctx, defaultTextStyle, attrs);

  ctx.rect(
    Math.floor(rect.position.x),
    Math.floor(rect.position.y),
    Math.floor(rect.size.x),
    Math.floor(rect.size.y)
  );
  ctx.clip();

  ctx.fillText(
    text,
    Math.floor(rect.position.x + (props?.offset?.x ?? 0)),
    Math.floor(rect.position.y + (props?.offset?.y ?? 0))
  );

  ctx.restore();
}
