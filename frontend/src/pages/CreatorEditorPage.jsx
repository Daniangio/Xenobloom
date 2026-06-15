import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const HEX_SIZE = 24;
const TERRAIN_OPTIONS = [
  { id: "neutral", label: "Normal", color: "#ffffff" },
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
const parseKey = (key) => key.split(",").map((part) => Number(part));

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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const response = await fetch(buildApiUrl("/api/game/config"), { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) setConfig(await response.json());
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

  const buildingOptions = useMemo(() => Object.values(config?.buildings || {}), [config]);
  const buildingPageSize = 5;
  const pagedBuildings = buildingOptions.slice(buildingPage * buildingPageSize, (buildingPage + 1) * buildingPageSize);
  const pageCount = Math.max(1, Math.ceil(buildingOptions.length / buildingPageSize));
  const selectedTile = payload.tiles[selectedKey] || {};
  const viewExtent = Math.max(500, editorRadius * HEX_SIZE * 2.1);

  const updateTile = (key, updater) => {
    setPayload((current) => {
      const nextTile = { ...(current.tiles[key] || {}) };
      updater(nextTile);
      const nextTiles = { ...current.tiles };
      const isDefault =
        (!nextTile.terrain || nextTile.terrain === "neutral") &&
        !nextTile.hydration &&
        !nextTile.nutrient_type &&
        !nextTile.building &&
        !nextTile.building_upgrade;
      if (isDefault) delete nextTiles[key];
      else nextTiles[key] = nextTile;
      return { ...current, tiles: nextTiles };
    });
  };

  const paintTile = (key) => {
    setSelectedKey(key);
    updateTile(key, (tile) => {
      tile.terrain = terrainBrush;
      if (buildingBrush !== "__unchanged") tile.building = buildingBrush || null;
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
          <section>
            <h1 className="text-xl font-semibold text-white">Map Creator</h1>
            {error ? <p className="mt-3 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
            <input className="mt-4 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={name} onChange={(event) => setName(event.target.value)} />
            <textarea className="mt-2 min-h-20 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />
            <button className="mt-2 w-full rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={() => setEditorRadius((radius) => radius + 4)} type="button">
              Expand Grid
            </button>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-white">Tiles</h2>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {TERRAIN_OPTIONS.map((option) => (
                <button className={`rounded-md border px-2 py-2 text-xs ${terrainBrush === option.id ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={option.id} onClick={() => setTerrainBrush(option.id)} type="button">
                  <span className="mx-auto mb-1 block h-5 w-5 rounded-sm border border-slate-600" style={{ backgroundColor: option.color }} />
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-white">Selected Tile</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">[{selectedKey}]</p>
            <label className="mt-3 block text-xs text-slate-400">Hydration</label>
            <input className="mt-1 w-full" type="range" min="-3" max="3" value={Number(selectedTile.hydration || 0)} onChange={(event) => updateTile(selectedKey, (tile) => { tile.hydration = Number(event.target.value); })} />
            <div className="mt-2 grid grid-cols-4 gap-2">
              {NUTRIENTS.map((nutrient) => (
                <button className={`rounded-md border px-2 py-2 text-xs ${selectedTile.nutrient_type === nutrient.id || (!selectedTile.nutrient_type && nutrient.id === null) ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={nutrient.label} onClick={() => updateTile(selectedKey, (tile) => { tile.nutrient_type = nutrient.id; })} type="button">
                  <span className="mx-auto mb-1 block h-3 w-3 rounded-full" style={{ backgroundColor: nutrient.color }} />
                  {nutrient.label}
                </button>
              ))}
            </div>
          </section>

          <section className="min-h-0">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Buildings</h2>
              <span className="text-xs text-slate-500">{buildingPage + 1}/{pageCount}</span>
            </div>
            <div className="mt-2 grid gap-2">
              <button className={`rounded-md border px-3 py-2 text-left text-xs ${buildingBrush === "" ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} onClick={() => setBuildingBrush("")} type="button">No building</button>
              <button className={`rounded-md border px-3 py-2 text-left text-xs ${buildingBrush === "__unchanged" ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} onClick={() => setBuildingBrush("__unchanged")} type="button">Keep building</button>
              {pagedBuildings.map((building) => (
                <button className={`rounded-md border px-3 py-2 text-left text-xs ${buildingBrush === building.id ? "border-teal-300 bg-slate-800" : "border-slate-700"}`} key={building.id} onClick={() => setBuildingBrush(building.id)} type="button">
                  {building.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <button className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" disabled={buildingPage === 0} onClick={() => setBuildingPage((page) => Math.max(0, page - 1))} type="button">Prev</button>
              <button className="flex-1 rounded-md border border-slate-700 px-2 py-1 text-xs disabled:opacity-40" disabled={buildingPage >= pageCount - 1} onClick={() => setBuildingPage((page) => Math.min(pageCount - 1, page + 1))} type="button">Next</button>
            </div>
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

          <section className="grid grid-cols-3 gap-2">
            <button className="rounded-md border border-slate-700 px-3 py-2 text-sm" onClick={() => navigate("/creator")} type="button">Back</button>
            <button className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={saving} onClick={() => save()} type="button">Save</button>
            <button className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={saving || isNew} onClick={() => save({ publish: true })} type="button">Publish</button>
          </section>
        </aside>

        <section className="relative overflow-hidden rounded-lg border border-slate-800 bg-white">
          <svg viewBox={`${-viewExtent} ${-viewExtent * 0.85} ${viewExtent * 2} ${viewExtent * 1.7}`} className="h-full w-full min-w-[48rem]">
            {allTiles.map((tile) => (
              <CreatorHex key={tile.key} tile={tile} data={payload.tiles[tile.key] || {}} selected={selectedKey === tile.key} onClick={() => paintTile(tile.key)} config={config} />
            ))}
          </svg>
        </section>
      </div>
    </main>
  );
};

const CreatorHex = ({ tile, data, selected, onClick, config }) => {
  const x = HEX_SIZE * Math.sqrt(3) * (tile.q + tile.r / 2);
  const y = HEX_SIZE * 1.5 * tile.r;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (2 * Math.PI / 6) * (index - 0.5);
    return `${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`;
  });
  const terrain = data.terrain || "neutral";
  const fill = TERRAIN_OPTIONS.find((option) => option.id === terrain)?.color || "#ffffff";
  const building = data.building ? config?.buildings?.[data.building] : null;
  const nutrient = NUTRIENTS.find((item) => item.id === data.nutrient_type);
  return (
    <g className="cursor-pointer" onClick={onClick}>
      <polygon fill={fill} points={points.join(" ")} stroke={selected ? "#f59e0b" : "#cbd5e1"} strokeWidth={selected ? 3 : 1} />
      {nutrient?.id ? <circle cx={x + 10} cy={y - 9} fill={nutrient.color} r="4" /> : null}
      {building ? <text fill="#0f172a" fontSize="9" fontWeight="700" textAnchor="middle" x={x} y={y + 3}>{building.label.slice(0, 2)}</text> : null}
      {data.hydration ? <text fill="#0f172a" fontSize="8" textAnchor="middle" x={x} y={y + 14}>{data.hydration > 0 ? `+${data.hydration}` : data.hydration}</text> : null}
    </g>
  );
};

export default CreatorEditorPage;
