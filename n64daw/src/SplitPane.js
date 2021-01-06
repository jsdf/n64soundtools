import {useState, useRef} from 'react';

import useRefOnce from './flatland/useRefOnce';
import {getMouseEventPos} from './flatland/mouseUtils';

const HANDLE_HEIGHT = 20;

class VerticalDraggable {
  dragging = false;
  options = null;

  setOptions(options) {
    this.options = options;
  }

  startDrag() {
    this.dragging = true;
    this.options?.setDragging(true);
  }

  endDrag() {
    this.dragging = false;
    this.options?.setDragging(false);
  }

  onMouseDown = () => {
    this.startDrag();
  };

  onMouseUp = () => {
    this.endDrag();
  };

  onMouseMove = (e) => {
    if (this.dragging && this.options?.viewportRef.current) {
      const mousePos = getMouseEventPos(e, this.options?.viewportRef.current);
      const newSplitPos = mousePos.y;
      const prevSplitPos = this.options?.splitPos;
      // hack to release grab when it seems to have gotten stuck
      if (
        prevSplitPos != null &&
        Math.abs(prevSplitPos - newSplitPos > 100 /* hand tuned */)
      ) {
        this.endDrag();
      }
      this.options?.setPos(newSplitPos);
    }
  };
}

export default function SplitPane({
  top,
  bottom,
  height,
  minHeight,
  styleTop,
  styleBottom,
}) {
  const [splitPos, setSplitPos] = useState(height - minHeight);
  const [dragging, setDragging] = useState(false);

  const viewportRef = useRef(null);

  const draggableRef = useRefOnce(() => new VerticalDraggable());

  draggableRef.current.setOptions({
    splitPos,
    setPos: (updated) => {
      setSplitPos(Math.min(height - minHeight, Math.max(updated, minHeight)));
    },
    viewportRef,
    setDragging,
  });

  const {onMouseDown, onMouseUp, onMouseMove} = draggableRef.current;

  // prevent panes from trying to handle events when dragging handle
  const swallowEventsStyle = {pointerEvents: dragging ? 'none' : null};

  return (
    <div
      style={{height, backgroundColor: '#8F8F8F'}}
      onMouseMove={onMouseMove}
      ref={viewportRef}
    >
      <div
        style={{
          height: splitPos - HANDLE_HEIGHT / 2,
          ...swallowEventsStyle,
          ...styleTop,
        }}
      >
        {top}
      </div>
      <div
        style={{
          height: HANDLE_HEIGHT,
          cursor: 'row-resize',
          fontSize: 48,
          lineHeight: '10px',
          textAlign: 'center',
          color: 'white',
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      >
        &middot;
      </div>
      <div
        style={{
          height: height - (splitPos + HANDLE_HEIGHT / 2),
          ...swallowEventsStyle,
          ...styleBottom,
        }}
      >
        {bottom}
      </div>
    </div>
  );
}
