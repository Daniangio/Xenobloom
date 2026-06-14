import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowUp,
  Check,
  Droplets,
  Flame,
  Info,
  Leaf,
  Sprout,
  X,
  Zap,
} from "lucide-react";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const HEX_SIZE = 22;
const HYDRATION_RANGE = { min: -3, max: 3 };
const STRESS_RANGE = { min: 0, max: 3 };
const WIND_ROTATION = {
  E: 90,
  SE: 150,
  SW: 210,
  W: 270,
  NW: 330,
  NE: 30,
};

const GameRoomPage = () => {
  const { roomId } = useParams();
  const { token } = useStore();
  const navigate = useNavigate();
  const [gameState, setGameState] = useState(null);
  const [selectedTileKey, setSelectedTileKey] = useState("0,0");
  const [detailContext, setDetailContext] = useState(null);
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
      setDetailContext(null);
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
  const selectedElement = gameState?.selected_element || null;
  const sortedTiles = useMemo(
    () => Object.values(gameState?.grid || {}).sort((a, b) => a.r - b.r || a.q - b.q),
    [gameState?.grid]
  );

  const openElementDetails = () => {
    if (selectedElement) setDetailContext({ mode: "element", element: selectedElement });
  };

  const openActionDetails = (action) => {
    if (action.type === "repair") {
      void submitCommand(commandFromAction(action, selectedTileKey));
      return;
    }
    setDetailContext({ mode: "action", action, element: action.element });
  };

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <div className="mx-auto grid h-[calc(100vh-2rem)] max-w-7xl gap-4 lg:grid-cols-[20rem_1fr]">
        <aside className="flex min-h-0 flex-col gap-4">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-teal-200">Solo Quick Match</p>
            <h1 className="mt-2 text-2xl font-semibold text-white">Xenobloom</h1>
            {error ? <p className="mt-4 rounded-md bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Selected Tile</h2>
              {selectedTile ? <span className="font-mono text-xs text-slate-500">[{selectedTile.q}, {selectedTile.r}]</span> : null}
            </div>
            {selectedTile ? (
              <div className="mt-4 space-y-4">
                <BipolarStat icon={<Droplets size={15} />} label="Hydration" value={selectedTile.hydration} range={HYDRATION_RANGE} />
                <PositiveStat icon={<Flame size={15} />} label="Stress" value={tileStress(selectedTile)} range={STRESS_RANGE} />
                <div className="text-sm capitalize text-slate-400">Terrain: {selectedTile.terrain}</div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">Select a tile on the board.</p>
            )}
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">Element</h2>
              {selectedElement ? (
                <button className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={openElementDetails} title="Open details" type="button">
                  <Info size={16} />
                </button>
              ) : null}
            </div>
            {selectedElement ? (
              <ElementSummary element={selectedElement} config={gameState?.config} />
            ) : (
              <p className="mt-3 text-sm text-slate-400">No building or special terrain on this tile.</p>
            )}
          </section>

          <section className="min-h-0 flex-1 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 className="font-semibold text-white">Actions</h2>
            <div className="mt-4 flex flex-col gap-2">
              {(gameState?.available_actions || []).map((action) => (
                <div
                  className="grid grid-cols-[1fr_auto] items-stretch overflow-hidden rounded-md border border-slate-700 bg-slate-950/40 text-sm text-slate-200"
                  key={`${action.type}:${action.building_type || action.upgrade_id || "repair"}`}
                >
                  <button
                    className="flex min-w-0 items-center gap-3 px-3 py-2 text-left hover:bg-slate-800 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => openActionDetails(action)}
                    type="button"
                  >
                    <ActionIcon action={action} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">{action.label}</span>
                      <ActionCostLine action={action} />
                    </span>
                  </button>
                  <button
                    className="flex w-11 items-center justify-center border-l border-slate-700 text-teal-200 hover:bg-teal-400 hover:text-slate-950 disabled:opacity-50"
                    disabled={busy}
                    onClick={() => submitCommand(commandFromAction(action, selectedTileKey))}
                    title={`Perform ${action.label}`}
                    type="button"
                  >
                    <Check size={17} />
                  </button>
                </div>
              ))}
              {gameState && (gameState.available_actions || []).length === 0 ? (
                <p className="text-sm text-slate-500">No legal actions for this tile.</p>
              ) : null}
            </div>
          </section>
        </aside>

        <section className="relative min-h-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-100">
          <WindField windLabel={gameState?.wind_label} />
          <TopBoardPanel busy={busy} endGame={endGame} gameState={gameState} submitCommand={submitCommand} />
          <WindIndicator windLabel={gameState?.wind_label} />
          <svg viewBox="-250 -205 500 410" className="relative z-[1] h-full w-full min-w-[36rem]">
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
          <BottomResourcePanel gameState={gameState} />
        </section>
      </div>

      {detailContext ? (
        <ElementDetailModal
          busy={busy}
          config={gameState?.config}
          context={detailContext}
          onClose={() => setDetailContext(null)}
          onBackToElement={() => setDetailContext({ mode: "element", element: detailContext.parentElement })}
          onSelectUpgrade={(action) => setDetailContext({ mode: "action", action, element: action.element, parentElement: detailContext.element })}
          submit={() => submitCommand(commandFromAction(detailContext.action, selectedTileKey))}
          upgradeActions={(gameState?.available_actions || []).filter((action) => action.type === "upgrade")}
        />
      ) : null}
    </main>
  );
};

const TopBoardPanel = ({ gameState, busy, submitCommand, endGame }) => {
  return (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center justify-start gap-2 rounded-lg border border-slate-800 bg-slate-950/95 p-2 shadow-xl">
      <CompactStat icon={<Activity size={14} />} label="Season" value={`${gameState?.season || "-"} / ${gameState?.max_seasons || "-"}`} />
      <CompactStat icon={<Leaf size={14} />} label="Maturity" value={`${gameState?.maturity || 0} / ${gameState?.target_maturity || "-"}`} />
      <button
        className="rounded-md bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-white disabled:opacity-50"
        disabled={busy || !gameState}
        onClick={() => submitCommand({ type: "end_season" })}
        type="button"
      >
        End Season
      </button>
      <button
        className="rounded-md border border-rose-500/60 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-950 disabled:opacity-50"
        disabled={busy}
        onClick={endGame}
        type="button"
      >
        End Game
      </button>
    </div>
  );
};

const CompactStat = ({ icon, label, value }) => (
  <div className="flex min-w-16 items-center gap-2 rounded-md bg-slate-900 px-2 py-1.5">
    <span className="text-slate-500">{icon}</span>
    <span>
      <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <span className="block text-xs font-semibold text-white">{value}</span>
    </span>
  </div>
);

const WindField = ({ windLabel }) => {
  const angle = (WIND_ROTATION[windLabel] ?? 90) - 90;
  const particles = [
    { left: "13%", top: "22%", delay: "0s", duration: "2.4s", width: "3.8rem" },
    { left: "31%", top: "38%", delay: "0.8s", duration: "3.1s", width: "2.8rem" },
    { left: "62%", top: "19%", delay: "1.6s", duration: "2.7s", width: "4.4rem" },
    { left: "78%", top: "52%", delay: "0.3s", duration: "3.4s", width: "3.2rem" },
    { left: "46%", top: "67%", delay: "2.1s", duration: "2.9s", width: "4rem" },
    { left: "19%", top: "74%", delay: "1.2s", duration: "3.6s", width: "2.5rem" },
    { left: "70%", top: "82%", delay: "2.7s", duration: "3.2s", width: "3.6rem" },
    { left: "41%", top: "14%", delay: "3.1s", duration: "2.6s", width: "3rem" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-[2] overflow-hidden">
      {particles.map((particle, index) => (
        <span
          className="xeno-wind-particle absolute"
          key={`${windLabel || "wind"}-${index}`}
          style={{
            "--wind-angle": `${angle}deg`,
            "--wind-delay": particle.delay,
            "--wind-duration": particle.duration,
            left: particle.left,
            top: particle.top,
            width: particle.width,
          }}
        />
      ))}
    </div>
  );
};

const WindIndicator = ({ windLabel }) => {
  const angle = WIND_ROTATION[windLabel] ?? 90;
  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/95 px-3 py-2 shadow-xl">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-sky-200">
        <ArrowUp size={18} style={{ transform: `rotate(${angle}deg)` }} />
      </span>
      <span className="font-mono text-sm font-semibold text-white">{windLabel || "-"}</span>
    </div>
  );
};

const BottomResourcePanel = ({ gameState }) => {
  const life = gameState?.resources?.life || {};
  const maxActions = Math.max(Number(gameState?.actions_left || 0), Number(gameState?.config?.rules?.actions_per_season || 3));
  return (
    <div className="absolute bottom-0 left-0 right-0 flex min-h-16 flex-wrap items-center gap-5 bg-slate-950/95 px-5 py-3 text-sm">
      <ActionMeter available={Number(gameState?.actions_left || 0)} total={maxActions} />
      <ResourceMeter
        allocated={Number(life.allocated || 0)}
        available={Number(life.available || 0)}
        color="bg-emerald-400"
        label="Life"
        nextAllocated={Number(life.next_allocated || 0)}
        nextProduced={Number(life.next_produced || 0)}
        produced={Number(life.produced || 0)}
        symbol="◆"
      />
    </div>
  );
};

const ActionMeter = ({ available, total }) => (
  <div className="flex items-center gap-3">
    <span className="min-w-5 text-right font-semibold text-white">{available}</span>
    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-teal-200">
      <Zap size={17} />
    </span>
    <SquareRows count={total} filled={available} color="bg-teal-300" />
  </div>
);

const ResourceMeter = ({ symbol, label, produced, allocated, available, nextProduced, nextAllocated, color }) => (
  <div className="flex items-center gap-3" title={`${label}: ${available} available`}>
    <span className="min-w-5 text-right font-semibold text-white">{available}</span>
    <span className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-emerald-300">
      {symbol}
    </span>
    <SquareRows count={produced} faded={allocated} filled={available} color={color} fadedFirst />
    <ResourceDeltaPreview
      allocated={allocated}
      color={color}
      nextAllocated={nextAllocated}
      nextProduced={nextProduced}
      produced={produced}
    />
  </div>
);

const ResourceDeltaPreview = ({ produced, allocated, nextProduced, nextAllocated, color }) => {
  const producedDelta = Number(nextProduced || 0) - Number(produced || 0);
  const allocatedDelta = Number(nextAllocated || 0) - Number(allocated || 0);
  if (producedDelta === 0 && allocatedDelta === 0) return null;

  const addedAllocated = Math.max(Math.min(producedDelta, allocatedDelta), 0);
  const addedFree = Math.max(producedDelta - addedAllocated, 0);
  const convertedToAllocated = Math.max(allocatedDelta - Math.max(producedDelta, 0), 0);
  const removedProduced = Math.max(-producedDelta, 0);
  const freedAllocated = Math.max(-allocatedDelta, 0);

  return (
    <span className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-950 px-2 py-1" title="Next turn economy change">
      {addedAllocated || addedFree ? (
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-400">+</span>
          <SquareGlyphs color={color} count={addedAllocated} faded />
          <SquareGlyphs color={color} count={addedFree} />
        </span>
      ) : null}
      {convertedToAllocated ? (
        <SquareTransition color={color} count={convertedToAllocated} />
      ) : null}
      {freedAllocated ? (
        <SquareTransition color={color} count={freedAllocated} reverse />
      ) : null}
      {removedProduced ? (
        <span className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-slate-400">-</span>
          <SquareGlyphs color={color} count={removedProduced} />
        </span>
      ) : null}
    </span>
  );
};

const SquareTransition = ({ color, count, reverse = false }) => (
  <span className="flex items-center gap-1">
    <SquareGlyphs color={color} count={count} faded={reverse} />
    <span className="text-[11px] text-slate-500">→</span>
    <SquareGlyphs color={color} count={count} faded={!reverse} />
  </span>
);

const SquareGlyphs = ({ color, count, faded = false }) => {
  if (!count) return null;
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: count }, (_, index) => (
        <span className={`h-3 w-3 rounded-sm border border-slate-700 ${color} ${faded ? "opacity-35" : ""}`} key={index} />
      ))}
    </span>
  );
};

const SquareRows = ({ count, filled, faded = 0, color, fadedFirst = false }) => {
  const total = Math.max(Number(count || 0), 0);
  const fadedCount = Math.min(Math.max(Number(faded || 0), 0), total);
  const filledCount = Math.min(Math.max(Number(filled || 0), 0), total - fadedCount);
  if (!total) {
    return <span className="grid grid-cols-5 gap-1"><span className="h-3 w-3 rounded-sm border border-slate-700 bg-slate-900" /></span>;
  }
  return (
    <span className="grid grid-cols-5 gap-1">
      {Array.from({ length: total }, (_, index) => {
        const isFaded = fadedFirst ? index < fadedCount : index >= filledCount && index < filledCount + fadedCount;
        const isFilled = fadedFirst ? index >= fadedCount && index < fadedCount + filledCount : index < filledCount;
        return (
          <span
            className={`h-3 w-3 rounded-sm border border-slate-700 ${isFilled ? color : isFaded ? `${color} opacity-35` : "bg-slate-900"}`}
            key={index}
          />
        );
      })}
    </span>
  );
};

const ElementSummary = ({ element, config }) => (
  <div className="mt-3 space-y-3">
    <div className="flex items-center gap-3">
      <ElementIcon element={element} />
      <div>
        <p className="font-semibold text-white">{element.label}</p>
        <p className="text-xs capitalize text-slate-500">{element.kind}</p>
      </div>
    </div>
    <TagList config={config} tags={element.tags || []} />
    <ProductionLine production={element.current_production || {}} stress={element.current_stress || 0} sustain={element.sustain_cost || 0} />
  </div>
);

const ElementDetailModal = ({ context, config, busy, onClose, onBackToElement, submit, upgradeActions, onSelectUpgrade }) => {
  const element = context.element;
  const action = context.action;
  const isAction = context.mode === "action";
  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4">
      <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <ElementIcon large element={element} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">{isAction ? "Preview" : "Details"}</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">{element?.label || action?.label}</h2>
              <TagList config={config} tags={element?.tags || []} />
            </div>
          </div>
          <button className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onClose} type="button">
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.3fr]">
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h3 className="font-semibold text-white">Current Output</h3>
            <ProductionLine production={element?.current_production || {}} stress={element?.current_stress || 0} sustain={element?.sustain_cost || 0} />
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-900 p-4">
            <h3 className="font-semibold text-white">Rules</h3>
            <div className="mt-3 space-y-2">
              {(element?.effects || []).map((effect) => (
                <EffectRule effect={effect} key={effect.id} />
              ))}
              {(element?.effects || []).length === 0 ? <p className="text-sm text-slate-500">No configured rules.</p> : null}
            </div>
          </div>
        </div>

        {context.mode === "element" && upgradeActions.length ? (
          <div className="mt-5 rounded-md border border-slate-800 bg-slate-900 p-4">
            <h3 className="font-semibold text-white">Upgrades</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {upgradeActions.map((upgradeAction) => (
                <button className="rounded-md border border-slate-700 px-3 py-2 text-left text-sm hover:bg-slate-800" key={upgradeAction.upgrade_id} onClick={() => onSelectUpgrade(upgradeAction)} type="button">
                  <span className="font-semibold text-white">{upgradeAction.label}</span>
                  <ActionCostLine action={upgradeAction} />
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isAction ? (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {context.parentElement ? (
              <button className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" onClick={onBackToElement} type="button">
                Back
              </button>
            ) : null}
            <button className="rounded-md bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60" disabled={busy} onClick={submit} type="button">
              Confirm {action?.type === "build" ? "Build" : "Upgrade"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};

const ElementIcon = ({ element, large = false }) => (
  <div
    className={`${large ? "h-20 w-20" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-md border border-slate-700`}
    style={{ backgroundColor: element?.color || "#334155" }}
  >
    <Sprout className="text-slate-950" size={large ? 32 : 18} />
  </div>
);

const ActionIcon = ({ action }) => {
  if (action?.element) return <ElementIcon element={action.element} />;
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-800">
      <Flame className="text-orange-300" size={18} />
    </div>
  );
};

const ActionCostLine = ({ action }) => (
  <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
    <CostChip className="text-teal-200" icon={<Zap size={12} />} value={action?.cost_actions || 0} />
    <CostChip className="text-emerald-300" icon="◆" value={action?.cost_life || 0} />
  </span>
);

const CostChip = ({ className, icon, value }) => (
  <span className={`inline-flex items-center gap-1 rounded bg-slate-950 px-1.5 py-0.5 font-semibold ${className}`}>
    {icon}
    <span>{value}</span>
  </span>
);

const ProductionLine = ({ production, stress, sustain }) => (
  <div className="mt-3 flex flex-wrap gap-2 text-xs">
    <span className="rounded bg-slate-950 px-2 py-1 text-emerald-300">◆ Life {production.life || 0}</span>
    <span className="rounded bg-slate-950 px-2 py-1 text-lime-300">● Mat {production.maturity || 0}</span>
    <span className="rounded bg-slate-950 px-2 py-1 text-orange-300">◈ Sustain {sustain || 0}</span>
    <span className="rounded bg-slate-950 px-2 py-1 text-rose-300">! Stress {stress || 0}</span>
  </div>
);

const TagList = ({ tags, config }) => {
  if (!tags?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {tags.map((tagId) => {
        const tag = config?.tags?.[tagId] || { label: tagId, color: "#64748b" };
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-950" key={tagId} style={{ backgroundColor: tag.color }}>
            {tag.label}
          </span>
        );
      })}
    </div>
  );
};

const EffectRule = ({ effect }) => (
  <div className="rounded-md bg-slate-950 px-3 py-2 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-semibold capitalize text-slate-200">{effect.type}</span>
      <span className={effect.type === "stress" ? "text-rose-300" : "text-emerald-300"}>
        {effect.specs?.resource ? `${effect.specs.resource} ` : ""}{signed(effect.specs?.value || 0)}
      </span>
    </div>
    <ConditionChips conditions={effect.specs?.conditions || {}} />
  </div>
);

const ConditionChips = ({ conditions }) => {
  const entries = Object.entries(conditions || {});
  if (!entries.length) return <p className="mt-1 text-slate-500">Always active</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
      {entries.map(([condition, values]) => (
        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300" key={condition}>
          {condition}: {(Array.isArray(values) ? values : [values]).join(" / ")}
        </span>
      ))}
    </div>
  );
};

const BipolarStat = ({ icon, label, value, range, compact = false }) => {
  const nodes = [];
  for (let current = range.min; current <= range.max; current += 1) {
    const active = value === 0 ? current === 0 : value < 0 ? current >= value && current <= 0 : current <= value && current >= 0;
    nodes.push(
      <span
        className={`${compact ? "h-2 w-2" : "h-3 w-3"} rounded-sm border border-slate-700 ${active ? (current < 0 ? "bg-rose-500" : current > 0 ? "bg-blue-400" : "bg-slate-300") : "bg-slate-900"}`}
        key={current}
      />
    );
  }
  return (
    <div className={`flex ${compact ? "items-center gap-2" : "flex-col gap-1"}`}>
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">{icon}{label}</span>
      <span className="flex items-center gap-1">{nodes}</span>
      <span className="text-xs text-slate-500">{value > 0 ? "+" : ""}{value}</span>
    </div>
  );
};

const PositiveStat = ({ icon, label, value, range, compact = false }) => {
  const nodes = Array.from({ length: range.max - range.min + 1 }, (_, index) => {
    const current = range.min + index;
    return (
      <span
        className={`${compact ? "h-2 w-2" : "h-3 w-3"} rounded-sm border border-slate-700 ${current <= value && current > 0 ? "bg-orange-400" : "bg-slate-900"}`}
        key={current}
      />
    );
  });
  return (
    <div className={`flex ${compact ? "items-center gap-2" : "flex-col gap-1"}`}>
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-400">{icon}{label}</span>
      <span className="flex items-center gap-1">{nodes}</span>
      <span className="text-xs text-slate-500">{value}/{range.max}</span>
    </div>
  );
};

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
  const stress = tileStress(tile);

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
      {building ? <BuildingGlyph building={building} config={config} tile={tile} x={x} y={y} /> : null}
      {stress > 0 ? (
        <text fill="#fff" fontSize="12" fontWeight="bold" stroke="#000" strokeWidth="1" textAnchor="middle" x={x} y={y + 4}>
          {"!".repeat(stress)}
        </text>
      ) : null}
    </g>
  );
};

const BuildingGlyph = ({ building, config, tile, x, y }) => {
  const tags = (building.tags || []).slice(0, 2);
  const tagRects = tags.map((tagId, index) => (
    <rect fill={config?.tags?.[tagId]?.color || "#94a3b8"} height="4" key={tagId} rx="1" width="7" x={x - 8 + index * 9} y={y + 12} />
  ));
  if (building.shape === "square") {
    return (
      <g>
        <rect fill={building.color} height={HEX_SIZE * 0.62} width={HEX_SIZE * 0.62} x={x - HEX_SIZE * 0.31} y={y - HEX_SIZE * 0.31} />
        {tile.building_upgrade ? <circle cx={x} cy={y} fill="#2b6cb0" r={HEX_SIZE * 0.18} /> : null}
        {tagRects}
      </g>
    );
  }
  if (building.shape === "diamond") {
    return (
      <g>
        <rect fill={building.color} height={HEX_SIZE * 0.5} transform={`rotate(45 ${x} ${y})`} width={HEX_SIZE * 0.5} x={x - HEX_SIZE * 0.25} y={y - HEX_SIZE * 0.25} />
        {tagRects}
      </g>
    );
  }
  return (
    <g>
      <circle cx={x} cy={y} fill={building.color} r={HEX_SIZE * 0.42} />
      {tile.building_upgrade ? <circle cx={x} cy={y} fill="#0f172a" r={HEX_SIZE * 0.18} /> : null}
      {tagRects}
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

const tileStress = (tile) => {
  if (!tile) return 0;
  const buildingStress = Number(tile.stress || 0);
  const terrainStress = tile.terrain && tile.terrain !== "neutral" ? Number(tile.terrain_stress || 0) : 0;
  return Math.max(buildingStress, terrainStress);
};

const signed = (value) => (Number(value) > 0 ? `+${value}` : String(value));

export default GameRoomPage;
