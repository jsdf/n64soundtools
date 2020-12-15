import Vector2 from './Vector2';
import Rect from './Rect';
import {getMouseEventPos} from './mouseUtils';
import React from 'react';
import {Behavior} from './behavior';

const {useState, useImperativeHandle, forwardRef} = React;

export function getSelectionBox(start, end) {
  const startX = Math.min(start.x, end.x);
  const startY = Math.min(start.y, end.y);
  const endX = Math.max(start.x, end.x);
  const endY = Math.max(start.y, end.y);
  return new Rect({
    position: new Vector2({x: startX, y: startY}),
    size: new Vector2({x: endX - startX, y: endY - startY}),
  });
}

export class DragEventBehavior extends Behavior {
  draggedEvents = [];
  dragStartPos = new Vector2();

  onMouseDown = (e) => {
    const mousePos = getMouseEventPos(e, this.canvas);
    const draggedEvent = this.props.getEventAtPos(mousePos);

    if (draggedEvent) {
      if (this.acquireLock('drag')) {
        let draggedSelection = this.props.selection ?? new Set();
        this.dragStartPos.copyFrom(mousePos);

        if (!this.props.selection?.has(draggedEvent.id)) {
          const newSelection = new Set([draggedEvent.id]);
          draggedSelection = newSelection;
          this.props.setSelection?.(newSelection);
        }
        // take a copy of the events at the time we started dragging
        this.draggedEvents = [];
        draggedSelection.forEach((id) =>
          this.draggedEvents.push(this.props.eventsMap.get(id))
        );
      }
    }
  };

  onMouseUp = (e) => {
    if (!this.hasLock('drag')) return;
    const mousePos = getMouseEventPos(e, this.canvas);

    this.props.onDragComplete?.(this.draggedEvents, {
      to: mousePos,
      from: this.dragStartPos,
    });
    this.releaseLock('drag');
  };

  onMouseOut = (e) => {
    this.releaseLock('drag');
  };

  onMouseMove = (e) => {
    if (!this.hasLock('drag')) return;
    const mousePos = getMouseEventPos(e, this.canvas);

    this.props.onDragMove?.(this.draggedEvents, {
      to: mousePos,
      from: this.dragStartPos,
    });
  };

  getEventHandlers() {
    return {
      mousemove: this.onMouseMove,
      // mouseout: this.onMouseOut,
      mouseup: this.onMouseUp,
      mousedown: this.onMouseDown,
    };
  }
}

export class SelectBoxBehavior extends Behavior {
  rect = new Rect();
  selectionStart = new Vector2();
  selectionEnd = new Vector2();

  onDisabled() {
    this.props.setSelectBoxRect?.(null);
  }

  onMouseDown = (e) => {
    if (this.acquireLock('drag')) {
      this.selectionStart.copyFrom(getMouseEventPos(e, this.canvas));
      this.selectionEnd.copyFrom(this.selectionStart);
    }
  };

  onMouseUp = (e) => {
    if (!this.hasLock('drag')) return;

    this.releaseLock('drag');
    this.props.setSelectBoxRect?.(null);

    const selectBoxRect = getSelectionBox(
      this.selectionStart,
      this.selectionEnd
    );

    this.props.onSelectRect?.(selectBoxRect);
  };

  onMouseOut = (e) => {
    if (!this.hasLock('drag')) return;

    this.releaseLock('drag');
    this.props.setSelectBoxRect?.(null);
  };

  onMouseMove = (e) => {
    if (!this.hasLock('drag')) return;

    this.selectionEnd.copyFrom(getMouseEventPos(e, this.canvas));

    const selectBoxRect = getSelectionBox(
      this.selectionStart,
      this.selectionEnd
    );

    this.props.setSelectBoxRect?.(selectBoxRect);
  };

  getEventHandlers() {
    return {
      mousemove: this.onMouseMove,
      mouseout: this.onMouseOut,
      mouseup: this.onMouseUp,
      mousedown: this.onMouseDown,
    };
  }
}

export const SelectBox = React.memo(
  forwardRef(function SelectBox(props, ref) {
    const [selectBoxRect, setSelectBoxRect] = useState(null);

    useImperativeHandle(ref, () => ({
      setSelectBoxRect,
    }));

    return (
      <div
        style={{
          height: 0,
          width: 0,
        }}
      >
        {selectBoxRect && (
          <div
            style={{
              transform: `translate3d(${selectBoxRect.position.x}px,${selectBoxRect.position.y}px,0)`,
              backgroundColor: 'white',
              opacity: 0.3,
              pointerEvents: 'none',
              width: selectBoxRect.size.x,
              height: selectBoxRect.size.y,
            }}
          />
        )}
      </div>
    );
  })
);
