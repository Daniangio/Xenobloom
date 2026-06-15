import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const playSubnavItems = [
  { label: "Solo Play", to: "/play/solo" },
  { label: "Creations", to: "/play/creations" },
];

const PlayCreationsPage = () => {
  const { token } = useStore();
  const navigate = useNavigate();
  const [creations, setCreations] = useState([]);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/creations/published"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "Failed to load creations.");
        setCreations(payload.creations || []);
      } catch (loadError) {
        setError(loadError.message || "Failed to load creations.");
      }
    };
    if (token) void load();
  }, [token]);

  const playCreation = async (creationId) => {
    setStartingId(creationId);
    setError("");
    try {
      const response = await fetch(buildApiUrl("/api/game/rooms"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "solo", game_type: "creation", creation_id: creationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to start creation.");
      navigate(`/games/${payload.id}`);
    } catch (playError) {
      setError(playError.message || "Failed to start creation.");
    } finally {
      setStartingId("");
    }
  };

  return (
    <>
      <PageSubnavigation items={playSubnavItems} />
      <section className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Creations</h1>
        <p className="mt-1 text-sm text-slate-400">Play published solo maps from creator mode.</p>
      </section>
      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      <section className="grid gap-4 md:grid-cols-3">
        {creations.map((creation) => (
          <article className="flex min-h-[13rem] flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-5" key={creation.id}>
            <div>
              <h2 className="text-lg font-semibold text-white">{creation.name}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{creation.description || "Custom solo scenario."}</p>
              <p className="mt-3 text-xs text-slate-500">By {creation.owner_username}</p>
            </div>
            <button className="mt-6 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60" disabled={Boolean(startingId)} onClick={() => playCreation(creation.id)} type="button">
              {startingId === creation.id ? "Starting..." : "Play"}
            </button>
          </article>
        ))}
        {!creations.length ? <p className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">No published creations yet.</p> : null}
      </section>
    </>
  );
};

export default PlayCreationsPage;
