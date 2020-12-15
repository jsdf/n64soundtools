import React from 'react';

import Vector2 from './Vector2';
import {zoomAtPoint} from './viewport';

const Controls = React.memo(function Controls({
  mode,
  onModeChange,
  viewportState,
  onViewportStateChange,
  canvasLogicalDimensions,
}) {
  return (
    <div
      style={{
        position: 'absolute',
        width: '50vw',
        top: 0,
        right: 0,
        textAlign: 'right',
      }}
    >
      {['select', 'pan'].map((value) => (
        <button
          key={value}
          style={{
            background: value === mode ? '#fff' : '#ccc',
          }}
          onClick={() => onModeChange(value)}
        >
          {value}
        </button>
      ))}
      <label style={{fontSize: 24}}>
        ⬌
        <input
          type="range"
          value={viewportState.zoom.x}
          min={0.5}
          max={10}
          step={0.01}
          onChange={(e) =>
            onViewportStateChange((s) => {
              const updatedZoom = s.zoom.clone();
              updatedZoom.x = parseFloat(e.target.value);

              const zoomPos = new Vector2({
                x: canvasLogicalDimensions.width / 2,
                y: canvasLogicalDimensions.height / 2,
              });

              return zoomAtPoint(s, zoomPos, updatedZoom);
            })
          }
        />
      </label>
      <label style={{fontSize: 24}}>
        ⬍
        <input
          type="range"
          value={viewportState.zoom.y}
          min={0.5}
          max={10}
          step={0.01}
          onChange={(e) =>
            onViewportStateChange((s) => {
              const updatedZoom = s.zoom.clone();
              updatedZoom.y = parseFloat(e.target.value);

              const zoomPos = new Vector2({
                x: canvasLogicalDimensions.width / 2,
                y: canvasLogicalDimensions.height / 2,
              });

              return zoomAtPoint(s, zoomPos, updatedZoom);
            })
          }
        />
      </label>
    </div>
  );
});

export default Controls;
