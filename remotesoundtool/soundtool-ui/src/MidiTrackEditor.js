import React from 'react';
import ReactDOM from 'react-dom';
import {Note as TonalNote} from '@tonaljs/tonal';

import {
  useViewport,
  makeViewportState,
  ViewportStateSerializer,
  DragPanBehavior,
  WheelZoomBehavior,
  WheelScrollBehavior,
  zoomAtPoint,
} from './roygbiv/viewport';

import {
  useCanvasContext2d,
  drawRect,
  drawTextRect,
} from './roygbiv/canvasUtils';

import {
  getIntersectingEvent,
  findIntersectingEvents,
} from './roygbiv/renderableRect';

import {useWindowDimensions, getDPR} from './roygbiv/windowUtils';

import {BehaviorController, Behavior, useBehaviors} from './roygbiv/behavior';

import Vector2 from './roygbiv/Vector2';
import Rect from './roygbiv/Rect';
import {range, scaleDiscreteQuantized} from './roygbiv/utils';

import {
  DragEventBehavior,
  SelectBoxBehavior,
  SelectBox,
} from './roygbiv/selection';

import useLocalStorageAsync from './roygbiv/useLocalStorageAsync';
import Controls from './roygbiv/Controls';
import {TooltipBehavior, Tooltip} from './roygbiv/Tooltip';

import {wrap} from './roygbiv/mathUtils';

const {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} = React;

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

const midiNotesRange = range(127);

function getExtents(events) {
  if (events.length === 0) {
    return {
      start: 0,
      end: 0,
      size: 0,
      minMidi: 0,
      maxMidi: midiNotesRange.length - 1,
    };
  }

  const minMidi = events.reduce((acc, ev) => Math.min(acc, ev.midi), 0);
  const maxMidi = events.reduce(
    (acc, ev) => Math.max(acc, ev.midi),
    midiNotesRange.length - 1
  );

  const start = events.reduce((acc, ev) => Math.min(acc, ev.time), Infinity);
  const end = events.reduce(
    (acc, ev) => Math.max(acc, ev.time + ev.duration),
    -Infinity
  );
  return {
    start,
    end,
    size: end - start,
    minMidi,
    maxMidi,
  };
}

function TooltipContent({event}) {
  return (
    <span>
      {event.name} vel={event.velocity * 0x7f}
    </span>
  );
}

const LOCALSTORAGE_CONFIG = {
  baseKey: 'n64soundtools-miditrackeditor',
  schemaVersion: '1',
};

function MidiTrackEditor({events, setEvents}) {
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
        }
      ),
    []
  );

  const renderedRectsRef = useRef([]);
  const [selection, setSelection] = useState(new Set());

  const [mode, setMode] = useLocalStorageAsync(
    'mode',
    'select',
    LOCALSTORAGE_CONFIG
  );

  const [viewportState, setViewportState] = useLocalStorageAsync(
    'viewportState',
    makeViewportState,
    {
      ...ViewportStateSerializer,
      ...LOCALSTORAGE_CONFIG,
    }
  );

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
    [viewport, quantizerX, quantizerY]
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

  const windowDimensions = useWindowDimensions();
  const canvasLogicalDimensions = windowDimensions;

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
      size.x = canvasLogicalDimensions.width;
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
        {offset: {x: 3, y: 14}}
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
    canvasLogicalDimensions,
    extents.start,
    extents.size,
    extents.minMidi,
    extents.maxMidi,
    quantizerX,
    quantizerY,
  ]);

  return (
    <div>
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
      <Controls
        mode={mode}
        onModeChange={setMode}
        viewportState={viewportState}
        onViewportStateChange={setViewportState}
        canvasLogicalDimensions={canvasLogicalDimensions}
      />
    </div>
  );
}

export default MidiTrackEditor;
