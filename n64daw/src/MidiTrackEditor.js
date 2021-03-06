import React from 'react';
import {Note as TonalNote} from '@tonaljs/tonal';

import {
  useViewport,
  makeViewportState,
  makeViewportStateFromExtents,
  DragPanBehavior,
  WheelZoomBehavior,
  WheelScrollBehavior,
} from './flatland/viewport';

import {
  useCanvasContext2d,
  drawRect,
  drawTextRect,
} from './flatland/canvasUtils';

import {
  getIntersectingEvent,
  findIntersectingEvents,
} from './flatland/renderableRect';

import {getDPR} from './flatland/windowUtils';

import {BehaviorController, useBehaviors} from './flatland/behavior';

import Rect from './flatland/Rect';
import {scaleDiscreteQuantized} from './flatland/utils';
import {midiNotesRange, getExtents} from './miditrack';

import {
  DragEventBehavior,
  SelectBoxBehavior,
  SelectBox,
} from './flatland/selection';

import Controls from './flatland/Controls';
import {TooltipBehavior, Tooltip} from './flatland/Tooltip';

import useGlobalState from './useGlobalState';

const {useEffect, useMemo, useRef, useState, useCallback} = React;

const colors = {
  whiteKey: '#eee',
  blackKey: '#bbb',
  selectionOutline: '#c88',
};

function colorForNote(note) {
  return note.acc.length ? colors.blackKey : colors.whiteKey;
}

const TIMELINE_ROW_HEIGHT = 20;
const QUARTER_NOTE_WIDTH = 10;

function TooltipContent({event}) {
  return (
    <span>
      {event.name} vel={event.velocity * 0x7f}
    </span>
  );
}

function MidiTrackEditor({events, setEvents, width, height}) {
  const viewportDimensions = useMemo(() => ({width, height}), [width, height]);
  const {canvasRef, ctx, canvas} = useCanvasContext2d();

  const eventsMap = useMemo(() => new Map(events.map((ev) => [ev.id, ev])), [
    events,
  ]);

  const extents = useMemo(() => getExtents(events), [events]);

  // map from pixels (unzoomed) to scale midis
  const quantizerY = useMemo(
    () =>
      scaleDiscreteQuantized(
        [0, (midiNotesRange.length - 1) * TIMELINE_ROW_HEIGHT], // continuous
        [midiNotesRange[0], midiNotesRange[midiNotesRange.length - 1]], // discrete
        {
          stepSize: 1,
          round: Math.round,
          alias: {
            domain: 'pixels',
            range: 'midiNotes',
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
            range: 'quarterNotes',
          },
        }
      ),
    []
  );

  const getViewportStateZoomedToExtents = useCallback(
    () =>
      makeViewportStateFromExtents(
        {
          min: {
            x: quantizerX.to('pixels', extents.start),
            y: quantizerY.to('pixels', extents.minMidi),
          },
          max: {
            x: quantizerX.to('pixels', extents.end),
            y: quantizerY.to('pixels', extents.maxMidi + 1),
          },
        },
        viewportDimensions
      ),
    [
      quantizerX,
      quantizerY,
      extents.start,
      extents.minMidi,
      extents.end,
      extents.maxMidi,
      viewportDimensions,
    ]
  );

  const renderedRectsRef = useRef([]);
  const [selection, setSelection] = useState(new Set());

  // retain this across different tracks
  const [mode, setMode] = useGlobalState(`${module.id}-mode`, 'select');

  const [viewportState, setViewportState] = useState(() => {
    const initialState = makeViewportState();
    initialState.zoom.y = 0.7;
    initialState.pan.y = quantizerY.invert(extents.minMidi);
    return initialState;
  });

  const viewport = useViewport(viewportState);

  const updateEventsOnDrag = useCallback(
    (draggedEvents, pos, updateType) => {
      const delta = pos.to.clone().sub(pos.from);

      const draggedEventsMap = new Map(draggedEvents.map((ev) => [ev.id, ev]));

      setEvents(
        (events) =>
          events.map((ev) => {
            if (draggedEventsMap.has(ev.id)) {
              const deltaXQuantized = quantizerX.scale(
                viewport.sizeXFromScreen(delta.x)
              );
              const deltaYQuantized = quantizerY.scale(
                viewport.sizeYFromScreen(delta.y)
              );
              const eventBeforeDrag = draggedEventsMap.get(ev.id);
              return {
                ...ev,
                // as the delta is since drag start, we need to use the copy of
                // the event at drag start
                time: eventBeforeDrag.time + deltaXQuantized,
                midi: eventBeforeDrag.midi + deltaYQuantized,
              };
            }

            return ev;
          }),
        updateType
      );
    },
    [viewport, quantizerX, quantizerY, setEvents]
  );

  const onDragMove = useCallback(
    (draggedEvents, pos) => {
      updateEventsOnDrag(draggedEvents, pos, 'optimistic');
    },
    [updateEventsOnDrag]
  );
  const onDragComplete = useCallback(
    (draggedEvents, pos) => {
      updateEventsOnDrag(draggedEvents, pos, 'commit');
    },
    [updateEventsOnDrag]
  );

  const onSelectRect = useCallback((selectBoxRect) => {
    const intersecting = findIntersectingEvents(
      selectBoxRect,
      renderedRectsRef.current
    );

    setSelection(new Set(intersecting.map((ev) => ev.id)));
  }, []);

  const getEventAtPos = useCallback(
    (pos) => getIntersectingEvent(pos, renderedRectsRef.current),
    []
  );

  const selectBoxRef = useRef(null);

  const tooltipRef = useRef(null);

  useBehaviors(
    () => {
      const controller = new BehaviorController();
      controller.addBehavior('dragPan', DragPanBehavior, 1);
      controller.addBehavior('wheelZoom', WheelZoomBehavior, 1);
      controller.addBehavior('wheelScroll', WheelScrollBehavior, 1);

      controller.addBehavior('dragEvent', DragEventBehavior, 2);
      controller.addBehavior('selection', SelectBoxBehavior, 1);
      controller.addBehavior('tooltip', TooltipBehavior, 1);

      return controller;
    },
    {
      canvas,
      props: {
        dragPan: {
          viewportState,
          setViewportState,
        },
        wheelZoom: {
          dimensions: {x: true},
          viewportState,
          setViewportState,
        },
        wheelScroll: {
          viewportState,
          setViewportState,
        },
        dragEvent: {
          getEventAtPos,
          onDragMove,
          onDragComplete,
          selection,
          setSelection,
          eventsMap,
        },
        selection: {
          setSelectBoxRect: selectBoxRef.current?.setSelectBoxRect,
          onSelectRect,
        },
        tooltip: {
          getEventAtPos,
          setTooltip: tooltipRef.current?.setTooltip,
        },
      },
      enabled: {
        dragPan: mode === 'pan',
        wheelZoom: mode === 'pan',
        wheelScroll: mode !== 'pan',
        selection: mode === 'select',
        dragEvent: mode === 'select',
      },
    }
  );

  // rendering
  useEffect(() => {
    if (!ctx) return;
    const {canvas} = ctx;
    const dpr = getDPR();
    // clear canvas & update to fill window
    canvas.width = viewportDimensions.width * dpr;
    canvas.height = viewportDimensions.height * dpr;

    canvas.style.width = `${viewportDimensions.width}px`;
    canvas.style.height = `${viewportDimensions.height}px`;

    // Scale all drawing operations by the dpr, so you
    // don't have to worry about the difference.
    ctx.scale(dpr, dpr);

    renderedRectsRef.current = [];

    // render the lanes
    for (let i = extents.minMidi; i <= extents.maxMidi; i++) {
      const note = TonalNote.get(TonalNote.fromMidi(i));
      const position = viewport.positionToScreen({
        x: 0,
        y: i * TIMELINE_ROW_HEIGHT,
      });
      position.x = 0;
      const size = viewport.sizeToScreen({
        x:
          Math.ceil((extents.start + extents.size) / 4) *
          4 *
          QUARTER_NOTE_WIDTH,
        y: TIMELINE_ROW_HEIGHT,
      });
      size.x = viewportDimensions.width;
      const rect = new Rect({
        position,
        size,
      });

      ctx.globalAlpha = 0.2;
      drawRect(ctx, rect, {
        fillStyle: colorForNote(note),
      });
      ctx.globalAlpha = 1;

      drawTextRect(
        ctx,
        note.name,
        rect,
        {
          fillStyle: colorForNote(note),
        },
        {offset: {x: 3, y: 10 + rect.size.y / 2 - 12 / 2}}
      );
    }

    // render the midi notes
    events.forEach((ev) => {
      const note = TonalNote.get(TonalNote.fromMidi(ev.midi));
      const rect = new Rect({
        position: viewport.positionToScreen({
          x: quantizerX.invert(ev.time),
          y: quantizerY.invert(ev.midi),
        }),
        size: viewport.sizeToScreen({
          x: ev.duration * QUARTER_NOTE_WIDTH,
          y: TIMELINE_ROW_HEIGHT,
        }),
      });
      rect.size.x = Math.max(rect.size.x, 1);
      drawRect(ctx, rect, {
        fillStyle: colorForNote(note),
        strokeStyle: selection.has(ev.id) ? colors.selectionOutline : null,
      });

      renderedRectsRef.current.push({
        rect,
        object: ev,
      });
    });
  }, [
    ctx,
    events,
    viewport,
    selection,
    viewportDimensions,
    extents.start,
    extents.size,
    extents.minMidi,
    extents.maxMidi,
    quantizerX,
    quantizerY,
  ]);

  return (
    <div style={{position: 'relative'}}>
      <SelectBox ref={selectBoxRef} />
      <Tooltip ref={tooltipRef} component={TooltipContent} />
      <canvas
        ref={canvasRef}
        width={1000}
        height={600}
        style={{
          overflow: 'hidden',
          cursor: mode === 'pan' ? 'grab' : null,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '50vw',
          top: 0,
          right: 0,
          textAlign: 'right',
        }}
      >
        <Controls
          mode={mode}
          onModeChange={setMode}
          viewportState={viewportState}
          onViewportStateChange={(vs) => {
            console.log(vs);
            setViewportState(vs);
          }}
          getDefaultViewportState={getViewportStateZoomedToExtents}
          viewportDimensions={viewportDimensions}
        />
      </div>
    </div>
  );
}

export default MidiTrackEditor;
