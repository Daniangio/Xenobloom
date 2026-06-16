export const NUTRIENT_COLORS = {
  green: "#48bb78",
  blue: "#4299e1",
  purple: "#9f7aea",
};

export const hydrationColor = (hydration) => {
  const colors = {
    "-3": "#742a2a",
    "-2": "#9b2c2c",
    "-1": "#e53e3e",
    0: "#718096",
    1: "#63b3ed",
    2: "#4299e1",
    3: "#2b6cb0",
  };
  return colors[String(hydration)] || "#718096";
};

export const HydrationSquares = ({
  value,
  min = -3,
  max = 3,
  interactive = false,
  onChange = null,
  sizeClass = "h-3 w-3",
}) => {
  const nodes = [];
  for (let current = min; current <= max; current += 1) {
    const active = value === 0
      ? current === 0
      : value < 0
        ? current >= value && current <= 0
        : current <= value && current >= 0;
    const square = (
      <span
        className={`inline-flex shrink-0 rounded-sm border border-slate-700 ${sizeClass} ${active ? "" : "bg-slate-900"}`}
        style={active ? { backgroundColor: hydrationColor(current) } : undefined}
      />
    );
    nodes.push(
      interactive ? (
        <button
          className="inline-flex shrink-0 items-center justify-center rounded-sm p-1 hover:bg-slate-800"
          key={current}
          onClick={() => onChange?.(current)}
          title={`Hydration ${current > 0 ? `+${current}` : current}`}
          type="button"
        >
          {square}
        </button>
      ) : (
        <span key={current}>{square}</span>
      )
    );
  }
  return <span className="flex items-center gap-1">{nodes}</span>;
};

export const tileStress = (tile) => {
  if (!tile) return 0;
  const buildingStress = Number(tile.stress || 0);
  const terrainStress = tile.terrain && tile.terrain !== "neutral" ? Number(tile.terrain_stress || 0) : 0;
  return Math.max(buildingStress, terrainStress);
};

export const hexCenter = ({ q, r }, size) => ({
  x: size * Math.sqrt(3) * (q + r / 2),
  y: size * 1.5 * r,
});

export const hexPoints = ({ q, r }, size) => {
  const { x, y } = hexCenter({ q, r }, size);
  return Array.from({ length: 6 }, (_, index) => {
    const angle = (2 * Math.PI / 6) * (index - 0.5);
    return `${x + size * Math.cos(angle)},${y + size * Math.sin(angle)}`;
  }).join(" ");
};

export const hexBoardBounds = (tiles, size, padding = size * 2) => {
  const list = Array.isArray(tiles) && tiles.length ? tiles : [{ q: 0, r: 0 }];
  const centers = list.map((tile) => hexCenter(tile, size));
  const minX = Math.min(...centers.map((center) => center.x)) - size - padding;
  const maxX = Math.max(...centers.map((center) => center.x)) + size + padding;
  const minY = Math.min(...centers.map((center) => center.y)) - size - padding;
  const maxY = Math.max(...centers.map((center) => center.y)) + size + padding;
  return {
    x: minX,
    y: minY,
    width: Math.max(size * 8, maxX - minX),
    height: Math.max(size * 8, maxY - minY),
  };
};

export const BuildingGlyph = ({ building, config, tile, x, y, size = 22 }) => {
  const tags = (building.tags || []).slice(0, 2);
  const buildingColor = tile.building === "assimilator" && tile.nutrient_type
    ? NUTRIENT_COLORS[tile.nutrient_type]
    : building.color;
  const tagRects = tags.map((tagId, index) => (
    <rect
      fill={config?.tags?.[tagId]?.color || "#94a3b8"}
      height={size * 0.18}
      key={tagId}
      rx="1"
      width={size * 0.32}
      x={x - size * 0.36 + index * size * 0.41}
      y={y + size * 0.55}
    />
  ));
  if (building.shape === "triangle") {
    return (
      <g>
        <path d={`M${x},${y - size * 0.42} L${x - size * 0.4},${y + size * 0.28} L${x + size * 0.4},${y + size * 0.28} Z`} fill={buildingColor} />
        <circle cx={x} cy={y} fill="#0f172a" r={size * 0.13} />
        {tagRects}
      </g>
    );
  }
  if (building.shape === "square") {
    return (
      <g>
        <rect fill={buildingColor} height={size * 0.62} width={size * 0.62} x={x - size * 0.31} y={y - size * 0.31} />
        {tile.building_upgrade ? <circle cx={x} cy={y} fill="#2b6cb0" r={size * 0.18} /> : null}
        {tagRects}
      </g>
    );
  }
  if (building.shape === "diamond") {
    return (
      <g>
        <rect fill={buildingColor} height={size * 0.5} transform={`rotate(45 ${x} ${y})`} width={size * 0.5} x={x - size * 0.25} y={y - size * 0.25} />
        {tagRects}
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} fill={buildingColor} r={size * 0.42} />
      {tile.building_upgrade ? <circle cx={x} cy={y} fill="#0f172a" r={size * 0.18} /> : null}
      {tagRects}
    </g>
  );
};

const HexTile = ({ config, tile, isSelected, onSelect, size = 22, showStress = true }) => {
  const { x, y } = hexCenter(tile, size);
  const fill = tile.terrain === "neutral"
    ? hydrationColor(tile.hydration)
    : config?.terrains?.[tile.terrain]?.color || "#718096";
  const building = config?.buildings?.[tile.building];
  const stress = tileStress(tile);

  return (
    <g className="cursor-pointer transition-opacity hover:opacity-80" onClick={onSelect}>
      <polygon
        fill={fill}
        points={hexPoints(tile, size)}
        stroke={isSelected ? "#fbbf24" : "#0f172a"}
        strokeWidth={isSelected ? 3 : 1}
      />
      {tile.nutrient_type ? (
        <circle
          cx={x + size * 0.43}
          cy={y - size * 0.42}
          fill={NUTRIENT_COLORS[tile.nutrient_type] || "#9f7aea"}
          r={size * 0.16}
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      ) : null}
      {tile.terrain === "rock" ? <circle cx={x} cy={y} fill="#2d3748" r={size * 0.5} /> : null}
      {tile.terrain === "forest" ? <path d={`M${x},${y - size * 0.36} L${x - size * 0.32},${y + size * 0.23} L${x + size * 0.32},${y + size * 0.23} Z`} fill="#1c4532" /> : null}
      {building ? <BuildingGlyph building={building} config={config} tile={tile} x={x} y={y} size={size} /> : null}
      {showStress && stress > 0 ? (
        <text fill="#fff" fontSize={size * 0.55} fontWeight="bold" stroke="#000" strokeWidth="1" textAnchor="middle" x={x} y={y + size * 0.18}>
          {"!".repeat(stress)}
        </text>
      ) : null}
    </g>
  );
};

export default HexTile;
