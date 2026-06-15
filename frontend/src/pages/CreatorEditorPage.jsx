import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import HexBoardViewport from "../components/HexBoardViewport.jsx";
import HexTile, { BuildingGlyph, HydrationSquares, hexBoardBounds, hexCenter, hexPoints, hydrationColor } from "../components/HexTile.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const HEX_SIZE = 24;
const TERRAIN_OPTIONS = [
  { id: "__empty", label: "Empty", color: "#ffffff" },
  { id: "neutral", label: "Normal", color: hydrationColor(0) },
  { id: "rock", label: "Mountain", color: "#475569" },
  { id: "forest", label: "Forest", color: "#2f855a" },
];
const NUTRIENTS = [
  { id: null, label: "None", color: "#64748b" },
  { id: "green", label: "Green", color: "#48bb78" },
  { id: "blue", label: "Blue", color: "#4299e1" },
  { id: "purple", label: "Purple", color: "#9f7aea" },
];

const defaultPayload = () => ({
  version: 1,
  tiles: {},
  goals: { mode: "all", survive_phases: 25, target_maturity: 1000 },
});

const tileKey = (q, r) => `${q},${r}`;
const EDITOR_TABS = [
  { id: "overview", label: "Overview" },
  { id: "tiles", label: "Tiles" },
  { id: "buildings", label: "Buildings" },
];

const CreatorEditorPage = () => {
  const { creationId } = useParams();
  const isNew = !creationId || creationId === "new";
  const { token } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("Untitled Creation");
  const [description, setDescription] = useState("");
  const [payload, setPayload] = useState(defaultPayload());
  const [config, setConfig] = useState(null);
  const [selectedKey, setSelectedKey] = useState("0,0");
  const [terrainBrush, setTerrainBrush] = useState("neutral");
  const [buildingBrush, setBuildingBrush] = useState("");
  const [buildingPage, setBuildingPage] = useState(0);
  const [editorRadius, setEditorRadius] = useState(10);
  const [activeTab, setActiveTab] = useState("overview");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const isPaintingRef = useRef(false);
  const lastPaintedKeyRef = useRef("");

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/game/config"), { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Failed to load game config.");
        setConfig(data);
      } catch (configError) {
        setError(configError.message || "Failed to load game config.");
      }
    };
    if (token) void loadConfig();
  }, [token]);

  useEffect(() => {
    if (!token || isNew) return;
    const loadCreation = async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/creations/${creationId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || "Failed to load creation.");
        setName(data.name || "Untitled Creation");
        setDescription(data.description || "");
        setPayload(data.payload || defaultPayload());
      } catch (loadError) {
        setError(loadError.message || "Failed to load creation.");
      }
    };
    void loadCreation();
  }, [creationId, isNew, token]);

  const allTiles = useMemo(() => {
    const tiles = [];
    for (let q = -editorRadius; q <= editorRadius; q += 1) {
      const minR = Math.max(-editorRadius, -q - editorRadius);
      const maxR = Math.min(editorRadius, -q + editorRadius);
      for (let r = minR; r <= maxR; r += 1) tiles.push({ q, r, key: tileKey(q, r) });
    }
    return tiles;
  }, [editorRadius]);

  const buildingOptions = useMemo(
    () => Object.values(config?.buildings || {}).filter((building) => building.buildable !== false || building.id === "core"),
    [config]
  );
  const buildingPageSize = 4;
  const pagedBuildings = buildingOptions.slice(buildingPage * buildingPageSize, (buildingPage + 1) * buildingPageSize);
  const pageCount = Math.max(1, Math.ceil(buildingOptions.length / buildingPageSize));
  const selectedTile = payload.tiles[selectedKey] || {};
  const paintedTileCount = Object.keys(payload.tiles || {}).length;
  const buildingCount = Object.values(payload.tiles || {}).filter((tile) => tile?.building).length;
  const nutrientCount = Object.values(payload.tiles || {}).filter((tile) => tile?.nutrient_type).length;
  const boardBounds = useMemo(() => hexBoardBounds(allTiles, HEX_SIZE, HEX_SIZE * 3), [allTiles]);

  const updateTile = (key, updater) => {
    setPayload((current) => {
      const nextTile = { ...(current.tiles[key] || {}) };
      updater(nextTile);
      const hasTileContent =
        nextTile.terrain ||
        nextTile.hydration ||
        nextTile.nutrient_type ||
        nextTile.building ||
        nextTile.building_upgrade;
      if (hasTileContent && !nextTile.terrain) nextTile.terrain = "neutral";
      const nextTiles = { ...current.tiles };
      const isDefault =
        !nextTile.terrain &&
        !nextTile.hydration &&
        !nextTile.nutrient_type &&
        !nextTile.building &&
        !nextTile.building_upgrade;
      if (isDefault) delete nextTiles[key];
      else nextTiles[key] = nextTile;
      return { ...current, tiles: nextTiles };
    });
  };

  const editTileFromBoard = (key) => {
    setSelectedKey(key);
    if (activeTab !== "tiles" && activeTab !== "buildings") return;
    if (lastPaintedKeyRef.current === key) return;
    lastPaintedKeyRef.current = key;

    if (activeTab === "buildings") {
      if (buildingBrush === "__unchanged") return;
      updateTile(key, (tile) => {
        tile.building = buildingBrush || null;
        if (buildingBrush && !tile.terrain) tile.terrain = "neutral";
      });
      return;
    }

    if (terrainBrush === "__empty") {
      setPayload((current) => {
        const nextTiles = { ...current.tiles };
        delete nextTiles[key];
        return { ...current, tiles: nextTiles };
      });
      return;
    }
    updateTile(key, (tile) => {
      tile.terrain = terrainBrush;
    });
  };

  const startPainting = (key) => {
    isPaintingRef.current = activeTab === "tiles" || activeTab === "buildings";
    lastPaintedKeyRef.current = "";
    editTileFromBoard(key);
  };

  const continuePainting = (key) => {
    if (!isPaintingRef.current) return;
    editTileFromBoard(key);
  };

  const stopPainting = () => {
    isPaintingRef.current = false;
    lastPaintedKeyRef.current = "";
  };

  const setSelectedBuilding = (buildingId) => {
    setBuildingBrush(buildingId || "");
    updateTile(selectedKey, (tile) => {
      tile.building = buildingId || null;
      if (buildingId && !tile.terrain) tile.terrain = "neutral";
    });
  };

  const save = async ({ publish = null } = {}) => {
    setSaving(true);
    setError("");
    try {
      const body = { name, description, payload };
      if (publish !== null) body.publish = publish;
      const response = await fetch(buildApiUrl(isNew ? "/api/creations" : `/api/creations/${creationId}`), {
        method: isNew ? "POST" : "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Failed to save creation.");
      if (isNew) navigate(`/creator/${data.id}/edit`, { replace: true });
      return data;
    } catch (saveError) {
      setError(saveError.message || "Failed to save creation.");
      return null;
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[21rem_1fr]">
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-800 bg-slate-950 p-1">
            {EDITOR_TABS.map((tab) => (
              <button
                className={`rounded-md px-2 py-2 text-xs font-semibold ${activeTab === tab.id ? "bg-teal-300 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" ? (
          <>
          <section>
            <h1 className="text-xl font-semibold text-white">Map Creator</h1>
            {error ? <p className="mt-3 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <input className="mt-4 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={name} onChange={(event) => setName(event.target.value)} />
            <textarea className="mt-2 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
            <button className="mt-2 w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setEditorRadius((radius) => radius + 4)} type="button">
              Expand Grid
            </button>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <h2 className="text-sm font-semibold text-white">Summary</h2>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <SummaryStat label="Tiles" value={paintedTileCount} />
              <SummaryStat label="Nutrients" value={nutrientCount} />
              <SummaryStat label="Buildings" value={buildingCount} />
            </div>
            <p className="mt-3 font-mono text-xs text-slate-500">Selected [{selectedKey}]</p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-white">Goals</h2>
            <label className="mt-2 block text-xs text-slate-400">Mode</label>
            <select className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" value={payload.goals?.mode || "all"} onChange={(event) => setPayload((current) => ({ ...current, goals: { ...current.goals, mode: event.target.value } }))}>
              <option value="all">Reach score before phase limit</option>
              <option value="survive">Survive phases</option>
              <option value="any">Either score or survival</option>
            </select>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" type="number" min="1" value={payload.goals?.survive_phases || 25} onChange={(event) => setPayload((current) => ({ ...current, goals: { ...current.goals, survive_phases: Number(event.target.value) } }))} />
              <input className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm" type="number" min="1" value={payload.goals?.target_maturity || 1000} onChange={(event) => setPayload((current) => ({ ...current, goals: { ...current.goals, target_maturity: Number(event.target.value) } }))} />
            </div>
          </section>
          </>
          ) : null}

          {activeTab === "tiles" ? (
          <>
          <section>
            <h2 className="text-sm font-semibold text-white">Tiles</h2>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TERRAIN_OPTIONS.map((option) => (
                <button className={`rounded-md border px-2 py-2 text-xs ${terrainBrush === option.id ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={option.id} onClick={() => setTerrainBrush(option.id)} type="button">
                  <span className="mx-auto mb-1 block h-5 w-5 rounded-sm border border-slate-600" style={{ backgroundColor: option.color }}>
                    {option.id === "__empty" ? <span className="block h-full w-full bg-[linear-gradient(135deg,transparent_45%,#94a3b8_47%,#94a3b8_53%,transparent_55%)]" /> : null}
                  </span>
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-white">Selected Tile</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">[{selectedKey}]</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-400">Hydration</span>
              <span className="text-xs text-slate-500">{Number(selectedTile.hydration || 0) > 0 ? "+" : ""}{Number(selectedTile.hydration || 0)}</span>
            </div>
            <div className="mt-2">
              <HydrationSquares
                interactive
                onChange={(value) => updateTile(selectedKey, (tile) => { tile.hydration = value; })}
                sizeClass="h-4 w-4"
                value={Number(selectedTile.hydration || 0)}
              />
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {NUTRIENTS.map((nutrient) => (
                <button className={`rounded-md border px-2 py-2 text-xs ${selectedTile.nutrient_type === nutrient.id || (!selectedTile.nutrient_type && nutrient.id === null) ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={nutrient.label} onClick={() => updateTile(selectedKey, (tile) => { tile.nutrient_type = nutrient.id; })} type="button">
                  <span className="mx-auto mb-1 block h-3 w-3 rounded-full" style={{ backgroundColor: nutrient.color }} />
                  {nutrient.label}
                </button>
              ))}
            </div>
          </section>
          </>
          ) : null}

          {activeTab === "buildings" ? (
          <section className="min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Buildings</h2>
              <span className="text-xs text-slate-500">{buildingPage + 1}/{pageCount}</span>
            </div>
            <div className="mt-2 grid gap-2">
              <button className={`rounded-md border px-3 py-2 text-left text-xs ${buildingBrush === "" ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} onClick={() => setSelectedBuilding("")} type="button">No building</button>
              {pagedBuildings.map((building) => (
                <button className={`flex items-center gap-3 rounded-md border px-3 py-2 text-left text-xs ${buildingBrush === building.id ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={building.id} onClick={() => setSelectedBuilding(building.id)} type="button">
                  <BuildingPreview building={building} config={config} />
                  <span>
                    <span className="block font-semibold text-slate-100">{building.label}</span>
                    <span className="text-slate-500">Place on selected tile</span>
                  </span>
                </button>
              ))}
              {config && buildingOptions.length === 0 ? <p className="text-xs text-slate-500">No buildings in config.</p> : null}
              {!config ? <p className="text-xs text-slate-500">Loading building config...</p> : null}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" disabled={buildingPage === 0} onClick={() => setBuildingPage((page) => Math.max(0, page - 1))} type="button">Prev</button>
              <button className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" disabled={buildingPage >= pageCount - 1} onClick={() => setBuildingPage((page) => Math.min(pageCount - 1, page + 1))} type="button">Next</button>
            </div>
          </section>
          ) : null}

          <section className="grid grid-cols-3 gap-2">
            <button className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => navigate("/creator")} type="button">Back</button>
            <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={saving} onClick={() => save()} type="button">Save</button>
            <button className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={saving || isNew} onClick={() => save({ publish: true })} type="button">Publish</button>
          </section>
        </aside>

        <section className="relative overflow-hidden rounded-lg border border-slate-800 bg-white">
          <HexBoardViewport
            bounds={boardBounds}
            onContextMenu={(event) => event.preventDefault()}
            onPointerCancel={stopPainting}
            onPointerLeave={stopPainting}
            onPointerUp={stopPainting}
            svgClassName="select-none"
          >
            {allTiles.map((tile) => (
              <CreatorHex
                config={config}
                data={payload.tiles[tile.key]}
                key={tile.key}
                onPointerDown={() => startPainting(tile.key)}
                onPointerEnter={() => continuePainting(tile.key)}
                selected={selectedKey === tile.key}
                tile={tile}
              />
            ))}
          </HexBoardViewport>
        </section>
      </div>
    </main>
  );
};

const CreatorHex = ({ tile, data, selected, onPointerDown, onPointerEnter, config }) => {
  const { x, y } = hexCenter(tile, HEX_SIZE);
  if (!data) {
    return (
      <g
        className="cursor-pointer transition-opacity hover:opacity-80"
        onPointerDown={onPointerDown}
        onPointerEnter={onPointerEnter}
      >
        <polygon
          fill="#ffffff"
          fillOpacity="0"
          points={hexPoints(tile, HEX_SIZE)}
          stroke={selected ? "#fbbf24" : "#cbd5e1"}
          strokeWidth={selected ? 3 : 1}
        />
      </g>
    );
  }
  const renderedTile = {
    ...tile,
    terrain: data.terrain || "neutral",
    hydration: Number(data.hydration || 0),
    building: data.building || null,
    building_upgrade: data.building_upgrade || null,
    nutrient_type: data.nutrient_type || null,
    stress: 0,
    terrain_stress: 0,
  };
  return (
    <g onPointerDown={onPointerDown} onPointerEnter={onPointerEnter}>
      <HexTile config={config} isSelected={selected} onSelect={() => {}} showStress={false} size={HEX_SIZE} tile={renderedTile} />
      {data.hydration ? <text fill="#0f172a" fontSize="8" textAnchor="middle" x={x} y={y + 14}>{data.hydration > 0 ? `+${data.hydration}` : data.hydration}</text> : null}
    </g>
  );
};

const SummaryStat = ({ label, value }) => (
  <div className="rounded-md border border-slate-800 bg-slate-900 px-2 py-2">
    <div className="text-lg font-semibold text-white">{value}</div>
    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
  </div>
);

const BuildingPreview = ({ building, config }) => {
  const tile = {
    q: 0,
    r: 0,
    terrain: "neutral",
    hydration: 0,
    building: building.id,
    building_upgrade: null,
    nutrient_type: building.id === "assimilator" ? "purple" : null,
  };
  return (
    <svg viewBox="-18 -18 36 36" className="h-9 w-9 shrink-0 rounded border border-slate-700 bg-slate-800">
      <BuildingGlyph building={building} config={config} tile={tile} x={0} y={0} size={22} />
    </svg>
  );
};

export default CreatorEditorPage;
