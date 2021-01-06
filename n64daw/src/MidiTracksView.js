import React from 'react';
import {useState, useRef, useEffect, useCallback, useMemo} from 'react';

import {
  useCanvasContext2d,
  drawRect,
  drawTextRect,
} from './flatland/canvasUtils';
import {getDPR} from './flatland/windowUtils';
import {midiNotesRange, getExtents} from './miditrack';
import {range, scaleDiscreteQuantized} from './flatland/utils';
import Rect from './flatland/Rect';

const styles = {
  selected: {
    backgroundColor: '#777',
  },
  deselected: {
    backgroundColor: '#555',
  },
};

const MINIMAP_HEIGHT = 100;

const QUARTER_NOTE_WIDTH = 4;
const MINIMAP_NOTE_HEIGHT = 1;

const Minimap = React.memo(function Minimap({events, selected}) {
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
    []
  );
  // map from pixels (unzoomed) to quarter notes
  const quantizerX = useMemo(
    () =>
      scaleDiscreteQuantized(
        [0, QUARTER_NOTE_WIDTH], // continuous
        [0, 1], // discrete
        {
          stepSize: 1,
          round: Math.round,
          alias: {
            domain: 'pixels',
            range: 'quarters',
          },
        }
      ),
    []
  );

  const canvasLogicalDimensions = useMemo(
    () => ({
      width: quantizerX.to('pixels', extents.end),
      height: MINIMAP_HEIGHT,
    }),
    [extents]
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
          x: ev.duration * QUARTER_NOTE_WIDTH,
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
}) {
  return (
    <>
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
                width: 100,
                flex: '0 0 100px',
                padding: 8,
                borderRight: 'solid 1px #333',
              }}
            >
              <div>track {i}</div>
              <div>inst: {track.instrument.number}</div>
            </div>
            <div
              style={{
                flex: '1 0 100%',
                ...(selected ? styles.selected : styles.deselected),
              }}
            >
              <Minimap events={track.notes} selected={selected} />
            </div>
          </div>
        );
      })}
    </>
  );
}
