import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const HEX_SIZE = 22;

const GameRoomPage = () => {
  const { roomId } = useParams();
  const { token } = useStore();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [selectedTileKey, setSelectedTileKey] = useState("0,0");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedTileQuery = selectedTileKey ? `?selected_tile=${encodeURIComponent(selectedTileKey)}` : "";

  const loadState = async () => {
    if (!token || !roomId) return;
    try {
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}/state${selectedTileQuery}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to load game state.");
      setGameState(payload);
      setError("");
      if (payload.phase === "FINISHED") navigate(`/games/${roomId}/post-game`, { replace: true });
    } catch (loadError) {
      setError(loadError.message || "Failed to load game state.");
    }
  };

  useEffect(() => {
    void loadState();
    const intervalId = window.setInterval(loadState, 1200);
    return () => window.clearInterval(intervalId);
  }, [roomId, selectedTileQuery, token]);

  const submitCommand = async (command) => {
    if (!token || !roomId || !gameState || busy) return;
    setBusy(true);
    setError("");
    try {
      const commandId = crypto?.randomUUID ? crypto.randomUUID() : `cmd_${Date.now()}_${Math.random()}`;
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}/commands`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          command_id: commandId,
          expected_revision: gameState.revision,
          client_timestamp_ms: Date.now(),
          ...command,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to submit command.");
      window.setTimeout(loadState, 250);
    } catch (commandError) {
      setError(commandError.message || "Failed to submit command.");
    } finally {
      setBusy(false);
    }
  };

  const endGame = async () => {
    if (!token || !roomId || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}/end`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to end game.");
      navigate(`/games/${roomId}/post-game`);
    } catch (endError) {
      setError(endError.message || "Failed to end game.");
      setBusy(false);
    }
  };

  const selectedTile = gameState?.selected_tile || null;
  const sortedTiles = useMemo(
    () => Object.values(gameState?.grid || {}).sort((a, b) => a.r - b.r || a.q - b.q),
    [gameState?.grid]
  );

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[21rem_1fr]">
        <aside className="flex min-h-0 flex-col gap-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Solo Quick Match</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Xenobloom</h1>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <Stat label="Season" value={`${gameState?.season || "-"} / ${gameState?.max_seasons || "-"}`} />
              <Stat label="Maturity" value={`${gameState?.maturity || 0} / ${gameState?.target_maturity || "-"}`} />
              <Stat label="Wind" value={gameState?.wind_label || "-"} />
              <Stat label="Actions" value={`${gameState?.actions_left || 0}`} />
            </div>
            <div className="mt-4 rounded-md bg-slate-950 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Produced</span>
                <span className="font-semibold text-emerald-300">{gameState?.base_economy?.prod ?? "-"}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-slate-400">Allocated</span>
                <span className="font-semibold text-orange-300">{gameState?.base_economy?.sustain ?? "-"}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-slate-800 pt-2">
                <span className="font-semibold text-slate-300">Available Life</span>
                <span className="font-semibold text-blue-300">{gameState?.available_life ?? "-"}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                className="flex-1 rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
                disabled={busy || !gameState}
                onClick={() => submitCommand({ type: "end_season" })}
                type="button"
              >
                End season
              </button>
              <button
                className="rounded-md border border-rose-500/60 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-950 disabled:opacity-50"
                disabled={busy}
                onClick={endGame}
                type="button"
              >
                End game
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-semibold text-white">Tile Actions</h2>
            {selectedTile ? (
              <p className="mt-1 text-xs text-slate-500">
                [{selectedTile.q}, {selectedTile.r}] {selectedTile.terrain} H{selectedTile.hydration >= 0 ? "+" : ""}{selectedTile.hydration}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">Select a tile.</p>
            )}
            <div className="mt-4 flex flex-col gap-2">
              {(gameState?.available_actions || []).map((action) => (
                <button
                  className="rounded-md border border-slate-700 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                  disabled={busy}
                  key={`${action.type}:${action.building_type || action.upgrade_id || "repair"}`}
                  onClick={() => submitCommand(commandFromAction(action, selectedTileKey))}
                  type="button"
                >
                  <span className="font-semibold text-white">{action.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {action.cost_actions || 0} action, {action.cost_life || 0} life
                  </span>
                </button>
              ))}
              {gameState && (gameState.available_actions || []).length === 0 ? (
                <p className="text-sm text-slate-500">No legal actions for this tile.</p>
              ) : null}
            </div>
            {error ? <p className="mt-4 rounded-md bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
          </section>

          <section className="min-h-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-semibold text-white">Log</h2>
            <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto text-xs text-slate-400">
              {(gameState?.logs || []).map((entry, index) => (
                <p className={index === 0 ? "text-slate-100" : ""} key={`${entry}:${index}`}>
                  {entry}
                </p>
              ))}
            </div>
          </section>
        </aside>

        <section className="relative min-h-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-100">
          <svg viewBox="-250 -205 500 410" className="h-full w-full min-w-[36rem]">
            {sortedTiles.map((tile) => (
              <HexTile
                config={gameState?.config}
                isSelected={selectedTileKey === `${tile.q},${tile.r}`}
                key={`${tile.q},${tile.r}`}
                onSelect={() => setSelectedTileKey(`${tile.q},${tile.r}`)}
                tile={tile}
              />
            ))}
          </svg>
          <div className="absolute bottom-0 left-0 right-0 flex min-h-14 items-center justify-between bg-slate-950/95 px-5 py-3 text-sm">
            {selectedTile ? (
              <>
                <span className="font-mono text-slate-300">[{selectedTile.q}, {selectedTile.r}]</span>
                <span className="capitalize text-slate-400">{selectedTile.terrain}</span>
                <span className="text-slate-300">
                  {formatBuilding(selectedTile, gameState?.config)}
                </span>
                <span className="text-orange-300">Stress {Math.max(selectedTile.stress || 0, selectedTile.terrain_stress || 0)}</span>
              </>
            ) : (
              <span className="text-slate-500">Select a tile to inspect state.</span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
};

const Stat = ({ label, value }) => (
  <div className="rounded-md bg-slate-950 p-2">
    <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{label}</p>
    <p className="mt-1 font-semibold text-white">{value}</p>
  </div>
);

const HexTile = ({ config, tile, isSelected, onSelect }) => {
  const x = HEX_SIZE * Math.sqrt(3) * (tile.q + tile.r / 2);
  const y = HEX_SIZE * 1.5 * tile.r;
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (2 * Math.PI / 6) * (index - 0.5);
    return `${x + HEX_SIZE * Math.cos(angle)},${y + HEX_SIZE * Math.sin(angle)}`;
  });
  const fill = tile.terrain === "neutral"
    ? hydrationColor(tile.hydration)
    : config?.terrains?.[tile.terrain]?.color || "#718096";
  const building = config?.buildings?.[tile.building];

  return (
    <g className="cursor-pointer transition-opacity hover:opacity-80" onClick={onSelect}>
      <polygon
        fill={fill}
        points={points.join(" ")}
        stroke={isSelected ? "#fbbf24" : "#0f172a"}
        strokeWidth={isSelected ? 3 : 1}
      />
      {tile.terrain === "rock" ? <circle cx={x} cy={y} fill="#2d3748" r={HEX_SIZE * 0.5} /> : null}
      {tile.terrain === "forest" ? <path d={`M${x},${y - 8} L${x - 7},${y + 5} L${x + 7},${y + 5} Z`} fill="#1c4532" /> : null}
      {building ? <BuildingGlyph building={building} tile={tile} x={x} y={y} /> : null}
      {(tile.stress > 0 || tile.terrain_stress > 0) ? (
        <text fill="#fff" fontSize="12" fontWeight="bold" stroke="#000" strokeWidth="1" textAnchor="middle" x={x} y={y + 4}>
          {"!".repeat(Math.max(tile.stress || 0, tile.terrain_stress || 0))}
        </text>
      ) : null}
    </g>
  );
};

const BuildingGlyph = ({ building, tile, x, y }) => {
  if (building.shape === "square") {
    return (
      <g>
        <rect fill={building.color} height={HEX_SIZE * 0.62} width={HEX_SIZE * 0.62} x={x - HEX_SIZE * 0.31} y={y - HEX_SIZE * 0.31} />
        {tile.building_upgrade ? <circle cx={x} cy={y} fill="#2b6cb0" r={HEX_SIZE * 0.18} /> : null}
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} fill={building.color} r={HEX_SIZE * 0.42} />
      {tile.building_upgrade ? <circle cx={x} cy={y} fill="#0f172a" r={HEX_SIZE * 0.18} /> : null}
    </g>
  );
};

const commandFromAction = (action, tileKey) => {
  if (action.type === "build") return { type: "build", tile_key: tileKey, building_type: action.building_type };
  if (action.type === "upgrade") return { type: "upgrade", tile_key: tileKey, upgrade_id: action.upgrade_id };
  return { type: action.type, tile_key: tileKey };
};

const hydrationColor = (hydration) => {
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

const formatBuilding = (tile, config) => {
  if (!tile?.building) return "None";
  const building = config?.buildings?.[tile.building]?.label || tile.building;
  const upgrade = tile.building_upgrade ? config?.upgrades?.[tile.building_upgrade]?.label || tile.building_upgrade : "";
  return upgrade ? `${upgrade} ${building}` : building;
};

export default GameRoomPage;
