import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const CreatorPage = () => {
  const { token } = useStore();
  const navigate = useNavigate();
  const [creations, setCreations] = useState([]);
  const [error, setError] = useState("");

  const loadCreations = async () => {
    try {
      const response = await fetch(buildApiUrl("/api/creations/mine"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to load creations.");
      setCreations(payload.creations || []);
    } catch (loadError) {
      setError(loadError.message || "Failed to load creations.");
    }
  };

  useEffect(() => {
    if (token) void loadCreations();
  }, [token]);

  const deleteCreation = async (creationId) => {
    try {
      const response = await fetch(buildApiUrl(`/api/creations/${creationId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to delete creation.");
      }
      setCreations((items) => items.filter((item) => item.id !== creationId));
    } catch (deleteError) {
      setError(deleteError.message || "Failed to delete creation.");
    }
  };

  return (
    <>
      <section className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Creator</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">Build solo PvE maps, define goals, and publish them for play.</p>
        </div>
        <button className="rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-300" onClick={() => navigate("/creator/new")} type="button">
          New Creation
        </button>
      </section>
      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
      <section className="grid gap-3">
        {creations.map((creation) => (
          <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4" key={creation.id}>
            <div>
              <h2 className="font-semibold text-white">{creation.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{creation.description || "No description"}</p>
              <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">{creation.status}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800" to={`/creator/${creation.id}/edit`}>
                Edit
              </Link>
              <button className="rounded-md border border-rose-500/60 px-3 py-2 text-sm text-rose-100 hover:bg-rose-950" onClick={() => deleteCreation(creation.id)} type="button">
                Delete
              </button>
            </div>
          </article>
        ))}
        {!creations.length ? <p className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">No creations yet.</p> : null}
      </section>
    </>
  );
};

export default CreatorPage;
