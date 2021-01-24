import {BehaviorController, useBehaviors, Behavior} from './flatland/behavior';
import {getMouseEventPos} from './flatland/mouseUtils';
import React, {useRef, useState, useEffect, useCallback, useMemo} from 'react';
import Rect from './flatland/Rect';
import {
  useCanvasContext2d,
  drawRect,
  clearCanvas,
} from './flatland/canvasUtils';
import {getDPR} from './flatland/windowUtils';
const BAR_HEIGHT = 20;
export function usePlayhead({playbackState, playerAPI, quantizerX}) {
  const playheadRef = useRef(null);
  const updatePlayheadPos = useCallback(() => {
    if (!playerAPI) return;
    const el = playheadRef.current;
    if (el) {
      const offset = playerAPI.getPlayOffset();
      el.style.transform = `translateX(${quantizerX.to(
        'pixels',
        offset / 1000
      )}px)`;
    }
  }, [playerAPI, quantizerX]);

  useEffect(() => {
    if (!playerAPI) return;
    if (playbackState.state === 'playing') {
      let animFrame;
      function tick() {
        animFrame = requestAnimationFrame(() => {
          updatePlayheadPos();
          tick();
        });
      }
      tick();

      return () => {
        cancelAnimationFrame(animFrame);
      };
    } else {
      updatePlayheadPos();
    }
  }, [updatePlayheadPos, playbackState, playerAPI, quantizerX]);
  return playheadRef;
}

export class ScrubBehavior extends Behavior {
  isMouseDown = false;
  onmousedown = (e) => {
    this.isMouseDown = true;
    this.onScrub(e);
  };

  onmouseup = (e) => {
    this.isMouseDown = false;
    this.controller.releaseLock('drag', this);
  };

  onScrub(e) {
    if (this.isMouseDown && !this.hasLock('drag')) {
      this.acquireLock('drag');
    }
    if (this.hasLock('drag')) {
      if (this.props.onScrub) {
        this.props.onScrub(getMouseEventPos(e, this.canvas));
      }
    }
  }

  onmousemove = (e) => {
    this.onScrub(e);
  };

  onEnabled() {
    this.isMouseDown = false;
  }

  getEventHandlers() {
    return {
      mousemove: this.onmousemove,
      mouseup: this.onmouseup,
      mousedown: this.onmousedown,
    };
  }
}

const Ruler = React.memo(function Ruler({quantizerX, width, minTime, maxTime}) {
  const {canvasRef, ctx, canvas} = useCanvasContext2d();

  const canvasLogicalDimensions = useMemo(
    () => ({
      width: width,
      height: BAR_HEIGHT,
    }),
    [width]
  );

  // rendering
  useEffect(() => {
    if (!ctx) return;
    clearCanvas(ctx, canvasLogicalDimensions, getDPR());

    // TODO: render ticks
    for (var i = minTime; i < maxTime; i++) {
      const rect = new Rect({
        position: {
          x: quantizerX.to('pixels', i),
          y: 0,
        },
        size: {
          x: 1,
          y: BAR_HEIGHT,
        },
      });

      drawRect(ctx, rect, {
        fillStyle: '#555',
      });
    }
  }, [ctx, canvasLogicalDimensions, quantizerX, minTime, maxTime]);

  return (
    <canvas
      ref={canvasRef}
      {...canvasLogicalDimensions}
      style={{
        overflow: 'hidden',
      }}
    />
  );
});

export function PlayheadBar({
  quantizerX,
  playerAPI,
  playbackState,
  width,
  minTime,
  maxTime,
}) {
  const [viewportEl, setViewportEl] = useState(null);

  const onScrub = useCallback(
    (mousePos) => {
      if (!playerAPI) return;
      const offset = Math.max(0, quantizerX.to('seconds', mousePos.x) * 1000);
      playerAPI.setPlayOffset(offset);
    },
    [playerAPI, quantizerX]
  );
  useBehaviors(
    () => {
      const controller = new BehaviorController();
      controller.addBehavior('scrub', ScrubBehavior, 1);

      return controller;
    },
    {
      canvas: viewportEl,
      props: {
        scrub: {
          onScrub,
        },
      },
      enabled: {
        scrub: true,
      },
    }
  );
  const playheadRef = usePlayhead({playbackState, playerAPI, quantizerX});

  return (
    <div
      style={{
        position: 'relative',
        userSelect: 'none',
        height: BAR_HEIGHT,
        width,
        backgroundColor: '#aaa',

        cursor: 'ew-resize',
      }}
      ref={setViewportEl}
    >
      <div
        ref={playheadRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          height: '100%',
          width: 1,
          backgroundColor: 'green',
          pointerEvents: 'none',
        }}
      />
      <Ruler {...{quantizerX, width, minTime, maxTime}} />
    </div>
  );
}
