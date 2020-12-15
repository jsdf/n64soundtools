import React from 'react';
import {Behavior} from './behavior';
import {getMouseEventPos} from './mouseUtils';

const {useState, useImperativeHandle, forwardRef} = React;

const TOOLTIP_OFFSET = 8;

export class TooltipBehavior extends Behavior {
  onMouseMove = (e) => {
    if (this.controller.lockExists('drag')) return;
    const mousePos = getMouseEventPos(e, this.canvas);

    const intersecting = this.props.getEventAtPos?.(mousePos);

    this.props.setTooltip?.(
      intersecting ? {position: mousePos, event: intersecting} : null
    );
  };

  onAnyLockChange(type, locked) {
    if (type === 'drag' && locked) {
      // hide tooltip
      this.props.setTooltip?.(null);
    }
  }

  getEventHandlers() {
    return {mousemove: this.onMouseMove};
  }
}

export const Tooltip = React.memo(
  forwardRef(function Tooltip({component}, ref) {
    const [tooltip, setTooltip] = useState(null);

    useImperativeHandle(ref, () => ({
      setTooltip,
    }));

    const Component = component;

    return (
      <div
        style={{
          height: 0,
          width: 0,
        }}
      >
        {tooltip && (
          <div
            style={{
              transform: `translate3d(${
                tooltip.position.x + TOOLTIP_OFFSET
              }px,${tooltip.position.y + TOOLTIP_OFFSET}px,0)`,
              color: '#000',
              backgroundColor: 'white',
              pointerEvents: 'none',
              width: 'fit-content',

              userSelect: 'none',
              fontSize: 10,
              fontFamily: ' Lucida Grande',
              padding: '2px 4px',
              boxShadow: '3px 3px 5px rgba(0,0,0,0.4)',
            }}
          >
            <Component position={tooltip.position} event={tooltip.event} />
          </div>
        )}
      </div>
    );
  })
);
