import './App.css';

import React from 'react';
import ReactDOM from 'react-dom';

import {
  useViewport,
  makeViewportState,
  ViewportStateSerializer,
  DragPanBehavior,
  WheelZoomBehavior,
  WheelScrollBehavior,
  zoomAtPoint,
} from './viewport';

import {useCanvasContext2d, drawRect, drawTextRect} from './canvasUtils';

import {getIntersectingEvent, findIntersectingEvents} from './renderableRect';

import {useWindowDimensions, getDPR} from './windowUtils';

import {BehaviorController, Behavior, useBehaviors} from './behavior';

import Vector2 from './Vector2';
import Rect from './Rect';
import {range, scaleDiscreteQuantized} from './utils';

import {DragEventBehavior, SelectBoxBehavior, SelectBox} from './selection';

import useLocalStorageAsync from './useLocalStorageAsync';
import Controls from './Controls';
import {TooltipBehavior, Tooltip} from './Tooltip';

import {wrap} from './mathUtils';

const {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} = React;

const colors = [
  '#ff1e47', // r
  '#ffa400', // o
  '#fff823', // y
  '#9cff42', // g
  '#23c2ff', // b
  '#6c3fd8', // i
  '#bb71ff', // v
];

const TIMELINE_ROW_HEIGHT = 20;
const QUARTER_NOTE_WIDTH = 10;

const scaleDegrees = range(7);

const initialEvents = [
  {degree: 0, start: 0, duration: 1},
  {degree: 3, start: 4, duration: 1},
  {degree: 5, start: 5, duration: 2},
  {degree: 6, start: 6, duration: 3},
].map((ev, index) => ({...ev, id: index}));

function getExtents(events) {
  if (events.length === 0) {
    return {
      start: 0,
      end: 0,
      size: 0,
      minDegree: 0,
      maxDegree: scaleDegrees.length - 1,
    };
  }

  const minDegree = events.reduce((acc, ev) => Math.min(acc, ev.degree), 0);
  const maxDegree = events.reduce(
    (acc, ev) => Math.max(acc, ev.degree),
    scaleDegrees.length - 1
  );

  const start = events.reduce((acc, ev) => Math.min(acc, ev.start), Infinity);
  const end = events.reduce(
    (acc, ev) => Math.max(acc, ev.start + ev.duration),
    -Infinity
  );
  return {
    start,
    end,
    size: end - start,
    minDegree,
    maxDegree,
  };
}

const LOCALSTORAGE_CONFIG = {
  baseKey: 'roygbiv',
  schemaVersion: '2',
};

function TooltipContent({event}) {
  return JSON.stringify(event);
}

function App() {
  const {canvasRef, ctx, canvas} = useCanvasContext2d();

  const [events, setEvents] = useState(initialEvents);
  const eventsMap = useMemo(() => new Map(events.map((ev) => [ev.id, ev])), [
    events,
  ]);

  const extents = useMemo(() => getExtents(events), [events]);

  // map from pixels (unzoomed) to scale degrees
  const quantizerY = useMemo(
    () =>
      scaleDiscreteQuantized(
        [0, (scaleDegrees.length - 1) * TIMELINE_ROW_HEIGHT], // continuous
        [scaleDegrees[0], scaleDegrees[scaleDegrees.length - 1]], // discrete
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

  const onDragMove = useCallback(
    (draggedEvents, pos) => {
      const delta = pos.to.clone().sub(pos.from);

      const draggedEventsMap = new Map(draggedEvents.map((ev) => [ev.id, ev]));

      setEvents((events) =>
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
              start: eventBeforeDrag.start + deltaXQuantized,
              degree: eventBeforeDrag.degree + deltaYQuantized,
            };
          }

          return ev;
        })
      );
    },
    [viewport, quantizerX, quantizerY]
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

    for (let i = extents.minDegree; i <= extents.maxDegree; i++) {
      const rect = new Rect({
        position: viewport.positionToScreen({
          x: 0,
          y: i * TIMELINE_ROW_HEIGHT,
        }),
        size: viewport.sizeToScreen({
          x:
            Math.ceil((extents.start + extents.size) / 4) *
            4 *
            QUARTER_NOTE_WIDTH,
          y: TIMELINE_ROW_HEIGHT,
        }),
      });

      ctx.globalAlpha = 0.2;
      drawRect(ctx, rect, {
        fillStyle: colors[wrap(i, colors.length)],
      });
      ctx.globalAlpha = 1;

      drawTextRect(
        ctx,
        String(i + 1),
        rect,
        {
          fillStyle: colors[wrap(i, colors.length)],
        },
        {offset: {x: 3, y: 14}}
      );
    }

    events.forEach((ev) => {
      const rect = new Rect({
        position: viewport.positionToScreen({
          x: quantizerX.invert(ev.start),
          y: quantizerY.invert(ev.degree),
        }),
        size: viewport.sizeToScreen({
          x: ev.duration * QUARTER_NOTE_WIDTH,
          y: TIMELINE_ROW_HEIGHT,
        }),
      });
      drawRect(ctx, rect, {
        fillStyle: colors[wrap(ev.degree, colors.length)],
        strokeStyle: selection.has(ev.id) ? 'white' : null,
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
    extents.minDegree,
    extents.maxDegree,
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

export default App;
