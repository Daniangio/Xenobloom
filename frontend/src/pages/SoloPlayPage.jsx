import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageSubnavigation } from "../components/AuthenticatedLayout.jsx";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const playSubnavItems = [
  { label: "Solo Play", to: "/play/solo" },
  { label: "Creations", to: "/play/creations" },
];

const SoloPlayPage = () => {
  const { token } = useStore();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const createQuickMatch = async () => {
    if (!token || creating) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch(buildApiUrl("/api/game/rooms"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode: "solo", game_type: "quick_match" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || "Failed to create game room.");
      navigate(`/games/${payload.id}`);
    } catch (createError) {
      setError(createError.message || "Failed to create game room.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <PageSubnavigation items={playSubnavItems} />

      <section className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Solo Play</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Grow an alien colony engine, adapt to shifting hazards, and push maturity as high as possible.
        </p>
      </section>

      {error ? <p className="mb-4 rounded-md bg-rose-950/70 px-3 py-2 text-sm text-rose-200">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <ModeCard
          title="Campaign"
          description="A structured sequence of colony scenarios. Prepared for future content."
          disabled
        />
        <ModeCard
          title="Missions"
          description="Standalone spatial puzzles with specific scoring constraints. Prepared for future content."
          disabled
        />
        <ModeCard
          title="Quick Match"
          description="Create a solo room immediately with mock lifecycle handling."
          actionLabel={creating ? "Creating..." : "Start"}
          onClick={createQuickMatch}
          disabled={creating}
        />
      </section>
    </>
  );
};

const ModeCard = ({ title, description, actionLabel = "Coming soon", disabled = false, onClick }) => (
  <article className="flex min-h-[15rem] flex-col justify-between rounded-lg border border-slate-800 bg-slate-900 p-5">
    <div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
    </div>
    <button
      className="mt-6 rounded-md bg-teal-400 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:border disabled:border-slate-700 disabled:bg-slate-950 disabled:text-slate-500"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {actionLabel}
    </button>
  </article>
);

export default SoloPlayPage;
