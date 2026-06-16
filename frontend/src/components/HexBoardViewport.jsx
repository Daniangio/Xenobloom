import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const zoomLevels = [0.8, 1, 1.25, 1.6, 2, 2.5];

const HexBoardViewport = ({
  bounds,
  children,
  className = "",
  svgClassName = "",
  minZoom = 0.8,
  maxZoom = 2.5,
  onContextMenu = null,
  onPointerCancel = null,
  onPointerLeave = null,
  onPointerUp = null,
  enablePan = true,
  panButton = 0,
  panModifierKey = null,
  controlsClassName = "left-3 top-3",
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const draggedRef = useRef(false);
  const svgRef = useRef(null);
  const normalizedBounds = bounds || { x: -250, y: -200, width: 500, height: 400 };
  const safeZoom = clamp(zoom, minZoom, maxZoom);
  const viewport = useMemo(
    () => ({
      width: normalizedBounds.width / safeZoom,
      height: normalizedBounds.height / safeZoom,
    }),
    [normalizedBounds.height, normalizedBounds.width, safeZoom]
  );

  const panLimits = useMemo(
    () => ({
      x: Math.max(0, (normalizedBounds.width - viewport.width) / 2),
      y: Math.max(0, (normalizedBounds.height - viewport.height) / 2),
    }),
    [normalizedBounds.height, normalizedBounds.width, viewport.height, viewport.width]
  );

  const clampPan = (nextPan) => ({
    x: clamp(nextPan.x, -panLimits.x, panLimits.x),
    y: clamp(nextPan.y, -panLimits.y, panLimits.y),
  });

  useEffect(() => {
    setPan((current) => clampPan(current));
  }, [panLimits.x, panLimits.y]);

  const viewBox = useMemo(() => {
    const centerX = normalizedBounds.x + normalizedBounds.width / 2;
    const centerY = normalizedBounds.y + normalizedBounds.height / 2;
    return `${centerX + pan.x - viewport.width / 2} ${centerY + pan.y - viewport.height / 2} ${viewport.width} ${viewport.height}`;
  }, [normalizedBounds, pan.x, pan.y, viewport.height, viewport.width]);

  const stepZoom = (direction) => {
    setZoom((current) => {
      const levels = zoomLevels.filter((level) => level >= minZoom && level <= maxZoom);
      const index = levels.reduce(
        (bestIndex, level, currentIndex) =>
          Math.abs(level - current) < Math.abs(levels[bestIndex] - current) ? currentIndex : bestIndex,
        0
      );
      return levels[clamp(index + direction, 0, levels.length - 1)] || current;
    });
  };

  const eventPoint = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: event.clientX,
      y: event.clientY,
      rectWidth: rect.width || 1,
      rectHeight: rect.height || 1,
    };
  };

  const handlePointerDown = (event) => {
    if (!enablePan || event.button !== panButton || panLimits.x + panLimits.y <= 0) return;
    if (panModifierKey && !event[panModifierKey]) return;
    const point = eventPoint(event);
    if (!point) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: point.x,
      startClientY: point.y,
      startPan: pan,
      rectWidth: point.rectWidth,
      rectHeight: point.rectHeight,
    };
    draggedRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) draggedRef.current = true;
    setPan(
      clampPan({
        x: drag.startPan.x - (deltaX / drag.rectWidth) * viewport.width,
        y: drag.startPan.y - (deltaY / drag.rectHeight) * viewport.height,
      })
    );
  };

  const finishPointer = (event) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragRef.current = null;
    }
  };

  const handleClickCapture = (event) => {
    if (!draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    window.setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  };

  return (
    <div className={`relative h-full w-full overflow-hidden ${className}`}>
      <div className={`absolute z-20 flex overflow-hidden rounded-md border border-slate-800 bg-slate-950/90 shadow-lg ${controlsClassName}`}>
        <button
          className="flex h-9 w-9 items-center justify-center text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          disabled={zoom <= minZoom}
          onClick={() => stepZoom(-1)}
          title="Zoom out"
          type="button"
        >
          <Minus size={16} />
        </button>
        <span className="flex h-9 min-w-14 items-center justify-center border-x border-slate-800 px-2 text-xs font-semibold text-slate-300">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="flex h-9 w-9 items-center justify-center text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          disabled={zoom >= maxZoom}
          onClick={() => stepZoom(1)}
          title="Zoom in"
          type="button"
        >
          <Plus size={16} />
        </button>
      </div>
      <svg
        ref={svgRef}
        className={`h-full w-full touch-none ${enablePan ? "cursor-grab active:cursor-grabbing" : ""} ${svgClassName}`}
        onClickCapture={handleClickCapture}
        onContextMenu={onContextMenu}
        onPointerCancel={(event) => {
          finishPointer(event);
          onPointerCancel?.(event);
        }}
        onPointerDown={handlePointerDown}
        onPointerLeave={(event) => {
          finishPointer(event);
          onPointerLeave?.(event);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          finishPointer(event);
          onPointerUp?.(event);
        }}
        preserveAspectRatio="xMidYMid meet"
        viewBox={viewBox}
      >
        {children}
      </svg>
    </div>
  );
};

export default HexBoardViewport;
