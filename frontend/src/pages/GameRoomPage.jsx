import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store.js";
import { buildApiUrl } from "../utils/connection.js";

const GameRoomPage = () => {
  const { roomId } = useParams();
  const { token } = useStore();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    const loadRoom = async () => {
      if (!token || !roomId) return;
      setError("");
      try {
        const response = await fetch(buildApiUrl(`/api/game/rooms/${roomId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "Failed to load game room.");
        setRoom(payload);
        if (payload.state === "FINISHED") navigate(`/games/${roomId}/post-game`, { replace: true });
      } catch (loadError) {
        setError(loadError.message || "Failed to load game room.");
      }
    };
    void loadRoom();
  }, [navigate, roomId, token]);

  const endGame = async () => {
    if (!token || !roomId || ending) return;
    setEnding(true);
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
      setEnding(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-slate-100">
      <section className="w-full max-w-md text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Solo Quick Match</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Game Room</h1>
        <p className="mt-2 break-all text-sm text-slate-500">{room?.id || roomId}</p>
        {error ? <p className="mt-5 rounded-md bg-rose-950/80 px-3 py-2 text-sm text-rose-200">{error}</p> : null}
        <button
          className="mt-8 rounded-md bg-teal-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:opacity-60"
          disabled={ending}
          onClick={endGame}
          type="button"
        >
          {ending ? "Ending..." : "End game"}
        </button>
      </section>
    </main>
  );
};

export default GameRoomPage;
