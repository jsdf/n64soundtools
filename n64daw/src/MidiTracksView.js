import React from 'react';
import {useRef, useState, useEffect, useCallback, useMemo} from 'react';

import {useCanvasContext2d, drawRect} from './flatland/canvasUtils';
import {getDPR} from './flatland/windowUtils';
import {getExtents} from './miditrack';
import {scaleLinear, scaleDiscreteQuantized} from './flatland/utils';
import Rect from './flatland/Rect';
import {BehaviorController, useBehaviors, Behavior} from './flatland/behavior';
import {getMouseEventPos} from './flatland/mouseUtils';

const styles = {
  selected: {
    backgroundColor: '#777',
  },
  deselected: {
    backgroundColor: '#555',
  },
};

const MINIMAP_HEIGHT = 100;

const ONE_SECOND_WIDTH = 4;
const TRACK_HEADER_WIDTH = 100;

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

const Minimap = React.memo(function Minimap({events, selected, quantizerX}) {
  const {canvasRef, ctx, canvas} = useCanvasContext2d();

  const extents = useMemo(() => getExtents(events), [events]);

  // map from pixels (unzoomed) to scale midis
  const quantizerY = useMemo(
    () =>
      scaleDiscreteQuantized(
        [0, MINIMAP_HEIGHT], // continuous
        [extents.minMidi, extents.maxMidi], // discrete
        {
          stepSize: 1,
          round: Math.round,
          alias: {
            domain: 'pixels',
            range: 'midi',
          },
        }
      ),
    [extents.minMidi, extents.maxMidi]
  );

  const canvasLogicalDimensions = useMemo(
    () => ({
      width: quantizerX.to('pixels', extents.end),
      height: MINIMAP_HEIGHT,
    }),
    [extents.end, quantizerX]
  );

  // rendering
  useEffect(() => {
    if (!ctx) return;
    const {canvas} = ctx;
    const dpr = getDPR();
    // clear canvas & update to fill window
    canvas.width = canvasLogicalDimensions.width * dpr;
    canvas.height = canvasLogicalDimensions.height * dpr;

    canvas.style.width = `${canvasLogicalDimensions.width}px`;
    canvas.style.height = `${canvasLogicalDimensions.height}px`;

    // Scale all drawing operations by the dpr, so you
    // don't have to worry about the difference.
    ctx.scale(dpr, dpr);

    // render the midi notes
    events.forEach((ev) => {
      const rect = new Rect({
        position: {
          x: quantizerX.to('pixels', ev.time),
          y: quantizerY.to('pixels', ev.midi),
        },
        size: {
          x: quantizerX.to('pixels', ev.duration),
          y: quantizerY.to('pixels', extents.minMidi + 1),
        },
      });
      rect.size.x = Math.max(rect.size.x, 1);
      drawRect(ctx, rect, {
        fillStyle: '#ccc',
      });
    });
  }, [ctx, events, canvasLogicalDimensions, extents.start, extents.size, extents.minMidi, extents.maxMidi, quantizerX, quantizerY, selected]);
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

export default function MidiTracksView({
  tracks,
  selectedTrackIndex,
  setSelectedTrackIndex,
  channelsEnabled,
  setChannelsEnabled,
  playbackState,
  playerAPI,
}) {
  // map from pixels (unzoomed) to seconds
  const quantizerX = useMemo(
    () =>
      scaleLinear(
        [0, ONE_SECOND_WIDTH], // domain
        [0, 1], // range
        {
          alias: {
            domain: 'pixels',
            range: 'seconds',
          },
        }
      ),
    []
  );

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

  const onScrub = useCallback(
    (mousePos) => {
      if (!playerAPI) return;
      if (mousePos.x < TRACK_HEADER_WIDTH) return;
      const offset = Math.max(
        0,
        quantizerX.to('seconds', mousePos.x - TRACK_HEADER_WIDTH) * 1000
      );
      playerAPI.setPlayOffset(offset);
    },
    [playerAPI, quantizerX]
  );

  const [viewportEl, setViewportEl] = useState(null);

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

  return (
    <div
      ref={setViewportEl}
      style={{
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div
        ref={playheadRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: TRACK_HEADER_WIDTH,
          height: '100%',
          width: 1,
          backgroundColor: 'red',
          pointerEvents: 'none',
        }}
      />
      {tracks.map((track, i) => {
        const selected = selectedTrackIndex === i;
        return (
          <div
            key={i}
            onClick={() => setSelectedTrackIndex(i)}
            style={{
              display: 'flex',
              // margin: '2px 0',
              borderBottom: 'solid 1px #333',
              ...(selected ? styles.selected : styles.deselected),
            }}
          >
            <div
              style={{
                width: TRACK_HEADER_WIDTH,
                flex: '0 0 100px',
                padding: 8,
                borderRight: 'solid 1px #333',
              }}
            >
              <div>track {i}</div>
              <div>
                inst: {track.instrument.number}
                <br />
                <label>ch: {track.channel}</label>
                <input
                  type="checkbox"
                  checked={channelsEnabled.has(track.channel)}
                  onChange={(e) => {
                    let updated = new Set(channelsEnabled);
                    if (e.currentTarget.checked) {
                      updated.add(track.channel);
                    } else {
                      updated.delete(track.channel);
                    }
                    setChannelsEnabled(updated);
                  }}
                />
              </div>
            </div>
            <div
              style={{
                flex: '1 0 100%',
                ...(selected ? styles.selected : styles.deselected),
              }}
            >
              <Minimap
                events={track.notes}
                selected={selected}
                quantizerX={quantizerX}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
