import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";

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
  controlsClassName = "left-3 top-3",
}) => {
  const [zoom, setZoom] = useState(1);
  const normalizedBounds = bounds || { x: -250, y: -200, width: 500, height: 400 };
  const viewBox = useMemo(() => {
    const safeZoom = clamp(zoom, minZoom, maxZoom);
    const width = normalizedBounds.width / safeZoom;
    const height = normalizedBounds.height / safeZoom;
    const centerX = normalizedBounds.x + normalizedBounds.width / 2;
    const centerY = normalizedBounds.y + normalizedBounds.height / 2;
    return `${centerX - width / 2} ${centerY - height / 2} ${width} ${height}`;
  }, [maxZoom, minZoom, normalizedBounds, zoom]);

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
        className={`h-full w-full ${svgClassName}`}
        onContextMenu={onContextMenu}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onPointerUp={onPointerUp}
        preserveAspectRatio="xMidYMid meet"
        viewBox={viewBox}
      >
        {children}
      </svg>
    </div>
  );
};

export default HexBoardViewport;
