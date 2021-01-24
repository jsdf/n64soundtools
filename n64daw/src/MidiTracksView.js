import React from 'react';
import {useEffect, useMemo} from 'react';

import {useCanvasContext2d, drawRect} from './flatland/canvasUtils';
import {getDPR} from './flatland/windowUtils';
import {getExtents} from './miditrack';
import {scaleLinear, scaleDiscreteQuantized} from './flatland/utils';
import Rect from './flatland/Rect';
import {PlayheadBar, usePlayhead} from './playhead';

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

const Minimap = React.memo(function Minimap({
  events,
  selected,
  quantizerX,
  allTracksExtents,
}) {
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
      width: quantizerX.to('pixels', allTracksExtents.end),
      height: MINIMAP_HEIGHT,
    }),
    [allTracksExtents.end, quantizerX]
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
  }, [
    ctx,
    events,
    canvasLogicalDimensions,
    extents.start,
    extents.size,
    extents.minMidi,
    extents.maxMidi,
    quantizerX,
    quantizerY,
    selected,
  ]);
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

// map from pixels (unzoomed) to seconds
const quantizerX = scaleLinear(
  [0, ONE_SECOND_WIDTH], // domain
  [0, 1], // range
  {
    alias: {
      domain: 'pixels',
      range: 'seconds',
    },
  }
);

export default function MidiTracksView({
  tracks,
  selectedTrackIndex,
  setSelectedTrackIndex,
  channelsEnabled,
  setChannelsEnabled,
  playbackState,
  playerAPI,
}) {
  const playheadRef = usePlayhead({playbackState, playerAPI, quantizerX});
  const allTracksExtents = useMemo(() => {
    return tracks.reduce((allExtents, track) => {
      const extents = getExtents(track.notes);
      if (!allExtents) return extents;

      allExtents.start = Math.min(allExtents.start, extents.start);
      allExtents.end = Math.max(allExtents.end, extents.end);
      allExtents.size = Math.max(allExtents.size, extents.size);
      allExtents.minMidi = Math.min(allExtents.minMidi, extents.minMidi);
      allExtents.maxMidi = Math.max(allExtents.maxMidi, extents.maxMidi);
      return allExtents;
    }, null);
  }, [tracks]);
  const tracksBodyWidth = quantizerX.to('pixels', allTracksExtents.end);

  return (
    <div>
      <div style={{marginLeft: TRACK_HEADER_WIDTH}}>
        <PlayheadBar
          {...{
            playbackState,
            playerAPI,
            quantizerX,
            width: tracksBodyWidth,
            minTime: 0,
            maxTime: allTracksExtents.end,
          }}
        />
      </div>
      <div
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
                  ...(selected ? styles.selected : styles.deselected),
                  width: tracksBodyWidth,
                }}
              >
                <Minimap
                  events={track.notes}
                  selected={selected}
                  quantizerX={quantizerX}
                  allTracksExtents={allTracksExtents}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
