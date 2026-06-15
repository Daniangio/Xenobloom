from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from .game_engine import GameEngine
from .server_models import User


ROOM_STATE_IN_GAME = "IN_GAME"
ROOM_STATE_FINISHED = "FINISHED"
COMMAND_STREAM_KEY = "game:commands"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _room_key(room_id: str) -> str:
    return f"game:room:{room_id}"


def _result_key(room_id: str) -> str:
    return f"game:result:{room_id}"


def _state_key(room_id: str) -> str:
    return f"game:state:{room_id}"


def _seen_commands_key(room_id: str) -> str:
    return f"game:room:{room_id}:seen_commands"


def _history_key(user_id: str) -> str:
    return f"game:user:{user_id}:history"


def _public_room(room: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": room.get("id", ""),
        "owner_user_id": room.get("owner_user_id", ""),
        "mode": room.get("mode", "solo"),
        "game_type": room.get("game_type", "quick_match"),
        "state": room.get("state", ROOM_STATE_IN_GAME),
        "created_at": room.get("created_at", ""),
        "started_at": room.get("started_at", ""),
        "ended_at": room.get("ended_at") or None,
        "result_id": room.get("result_id") or None,
    }


class GameRoomService:
    def __init__(self, redis_client=None, engine: GameEngine | None = None) -> None:
        self.redis = redis_client
        self.engine = engine or GameEngine()
        self._memory_rooms: dict[str, dict[str, Any]] = {}
        self._memory_states: dict[str, dict[str, Any]] = {}
        self._memory_results: dict[str, dict[str, Any]] = {}
        self._memory_history: dict[str, list[str]] = {}
        self._memory_seen_commands: dict[str, set[str]] = {}

    def configure_redis(self, redis_client) -> None:
        self.redis = redis_client

    async def create_room(self, *, user: User, game_type: str, creation: dict[str, Any] | None = None) -> dict[str, Any]:
        normalized_game_type = str(game_type or "quick_match").strip() or "quick_match"
        if normalized_game_type not in {"quick_match", "creation"}:
            raise ValueError("Only quick match and creations are available right now.")
        if normalized_game_type == "creation" and not creation:
            raise ValueError("Creation not found or is not published.")
        room_id = f"solo_{uuid.uuid4().hex[:16]}"
        now = _now_iso()
        room = {
            "id": room_id,
            "owner_user_id": user.id,
            "owner_username": user.username or user.email or user.id,
            "mode": "solo",
            "game_type": normalized_game_type,
            "creation_id": str((creation or {}).get("id") or ""),
            "state": ROOM_STATE_IN_GAME,
            "created_at": now,
            "started_at": now,
            "ended_at": "",
            "result_id": "",
        }
        if self.redis is None:
            self._memory_rooms[room_id] = room
            self._memory_states[room_id] = self.engine.create_initial_state(creation=(creation or {}).get("payload") if creation else None)
            return _public_room(room)
        await self.redis.hset(_room_key(room_id), mapping=room)
        await self._save_state(room_id, self.engine.create_initial_state(creation=(creation or {}).get("payload") if creation else None))
        return _public_room(room)

    async def get_room(self, *, room_id: str, user: User) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            return None
        return _public_room(room)

    async def enqueue_end_room(self, *, room_id: str, user: User) -> dict[str, Any]:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            raise LookupError("Game room not found.")
        if room.get("state") == ROOM_STATE_FINISHED:
            return _public_room(room)
        command = {
            "action": "finish_room",
            "room_id": room_id,
            "user_id": user.id,
            "command_id": f"finish_{uuid.uuid4().hex}",
            "client_timestamp_ms": str(int(time.time() * 1000)),
            "requested_at": _now_iso(),
        }
        if self.redis is None:
            await self.finish_room(room_id=room_id, user_id=user.id)
        else:
            await self.redis.xadd(COMMAND_STREAM_KEY, command, maxlen=1000, approximate=True)
        return _public_room(room)

    async def get_game_state(self, *, room_id: str, user: User, selected_tile: str | None = None) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            return None
        state = await self._load_state(room_id)
        if state is None:
            return None
        return self.engine.public_state(state, selected_tile=selected_tile)

    async def enqueue_game_command(
        self,
        *,
        room_id: str,
        user: User,
        command: dict[str, Any],
    ) -> dict[str, Any]:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user.id:
            raise LookupError("Game room not found.")
        command_id = str(command.get("command_id") or "").strip() or f"cmd_{uuid.uuid4().hex}"
        command_payload = {
            "action": "game_command",
            "room_id": room_id,
            "user_id": user.id,
            "command_id": command_id,
            "type": str(command.get("type") or ""),
            "tile_key": str(command.get("tile_key") or ""),
            "building_type": str(command.get("building_type") or ""),
            "upgrade_id": str(command.get("upgrade_id") or ""),
            "expected_revision": str(command.get("expected_revision") if command.get("expected_revision") is not None else ""),
            "client_timestamp_ms": str(command.get("client_timestamp_ms") or int(time.time() * 1000)),
            "requested_at": _now_iso(),
        }
        if self.redis is None:
            await self.apply_game_command(command_payload)
        else:
            await self.redis.xadd(COMMAND_STREAM_KEY, command_payload, maxlen=5000, approximate=True)
        state = await self._load_state(room_id)
        return {
            "status": "queued",
            "command_id": command_id,
            "revision": int((state or {}).get("revision") or 0),
        }

    async def apply_game_command(self, command: dict[str, Any]) -> dict[str, Any] | None:
        room_id = str(command.get("room_id") or "")
        user_id = str(command.get("user_id") or "")
        command_id = str(command.get("command_id") or "")
        if not room_id or not user_id or not command_id:
            return None
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id or room.get("state") == ROOM_STATE_FINISHED:
            return None
        if not await self._mark_command_seen(room_id, command_id):
            return await self._load_state(room_id)
        state = await self._load_state(room_id)
        if state is None:
            return None
        engine_command = self._normalize_engine_command(command)
        try:
            self.engine.validate_command(state, engine_command)
            next_state = self.engine.apply_command(state, engine_command)
        except ValueError as exc:
            next_state = state
            next_state["logs"] = [f"Rejected order: {exc}", *list(next_state.get("logs") or [])][:8]
            next_state["revision"] = int(next_state.get("revision") or 0) + 1
        await self._save_state(room_id, next_state)
        if next_state.get("phase") == ROOM_STATE_FINISHED:
            await self.finish_room(room_id=room_id, user_id=user_id)
        return next_state

    async def finish_room(self, *, room_id: str, user_id: str) -> dict[str, Any] | None:
        room = await self._load_room(room_id)
        if not room or room.get("owner_user_id") != user_id:
            return None
        if room.get("state") == ROOM_STATE_FINISHED:
            return await self.get_result(room_id=room_id, user_id=user_id)
        now = _now_iso()
        state = await self._load_state(room_id) or {}
        outcome = state.get("game_over") or "completed"
        maturity = int(state.get("maturity") or 0)
        turns = max(0, int(state.get("season") or 1) - 1)
        result = {
            "id": room_id,
            "room_id": room_id,
            "user_id": user_id,
            "mode": room.get("mode", "solo"),
            "game_type": room.get("game_type", "quick_match"),
            "outcome": str(outcome),
            "maturity": str(maturity),
            "turns": str(turns),
            "duration_seconds": str(max(1, int(time.time() - _iso_to_epoch(room.get("started_at"))))),
            "summary": f"Colony run ended with {maturity} maturity after {turns} seasons.",
            "created_at": now,
        }
        room.update({"state": ROOM_STATE_FINISHED, "ended_at": now, "result_id": room_id})
        if state:
            state["phase"] = ROOM_STATE_FINISHED
            await self._save_state(room_id, state)
        if self.redis is None:
            self._memory_rooms[room_id] = room
            self._memory_results[room_id] = result
            self._memory_history.setdefault(user_id, [])
            if room_id not in self._memory_history[user_id]:
                self._memory_history[user_id].append(room_id)
            return self._public_result(result)
        await self.redis.hset(_room_key(room_id), mapping=room)
        await self.redis.hset(_result_key(room_id), mapping=result)
        await self.redis.zadd(_history_key(user_id), {room_id: time.time()})
        return self._public_result(result)

    async def get_result(self, *, room_id: str, user_id: str) -> dict[str, Any] | None:
        result = await self._load_result(room_id)
        if not result or result.get("user_id") != user_id:
            return None
        return self._public_result(result)

    async def list_history(self, *, user_id: str, limit: int = 25) -> list[dict[str, Any]]:
        normalized_limit = max(1, min(100, int(limit or 25)))
        if self.redis is None:
            room_ids = list(reversed(self._memory_history.get(user_id, [])))[:normalized_limit]
        else:
            room_ids = await self.redis.zrevrange(_history_key(user_id), 0, normalized_limit - 1)
        results: list[dict[str, Any]] = []
        for room_id in room_ids:
            result = await self.get_result(room_id=str(room_id), user_id=user_id)
            if result is not None:
                results.append(result)
        return results

    async def _load_room(self, room_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_rooms.get(room_id)
        room = await self.redis.hgetall(_room_key(room_id))
        return dict(room) if room else None

    async def _load_result(self, room_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_results.get(room_id)
        result = await self.redis.hgetall(_result_key(room_id))
        return dict(result) if result else None

    async def _load_state(self, room_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_states.get(room_id)
        raw = await self.redis.get(_state_key(room_id))
        if not raw:
            return None
        return json.loads(raw)

    async def _save_state(self, room_id: str, state: dict[str, Any]) -> None:
        if self.redis is None:
            self._memory_states[room_id] = state
            return
        await self.redis.set(_state_key(room_id), json.dumps(state, separators=(",", ":")))

    async def _mark_command_seen(self, room_id: str, command_id: str) -> bool:
        if self.redis is None:
            seen = self._memory_seen_commands.setdefault(room_id, set())
            if command_id in seen:
                return False
            seen.add(command_id)
            return True
        return bool(await self.redis.sadd(_seen_commands_key(room_id), command_id))

    @staticmethod
    def _normalize_engine_command(command: dict[str, Any]) -> dict[str, Any]:
        expected_revision = command.get("expected_revision")
        return {
            "command_id": str(command.get("command_id") or ""),
            "type": str(command.get("type") or ""),
            "tile_key": str(command.get("tile_key") or ""),
            "building_type": str(command.get("building_type") or ""),
            "upgrade_id": str(command.get("upgrade_id") or ""),
            "expected_revision": int(expected_revision) if str(expected_revision or "").strip() else None,
            "client_timestamp_ms": int(command.get("client_timestamp_ms") or 0),
        }

    def _public_result(self, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": result.get("id", ""),
            "room_id": result.get("room_id", ""),
            "mode": result.get("mode", "solo"),
            "game_type": result.get("game_type", "quick_match"),
            "outcome": result.get("outcome", "completed"),
            "maturity": int(result.get("maturity") or 0),
            "turns": int(result.get("turns") or 0),
            "duration_seconds": int(result.get("duration_seconds") or 0),
            "summary": result.get("summary", ""),
            "created_at": result.get("created_at", ""),
        }


class GameWorker:
    def __init__(self, service: GameRoomService, *, stream_key: str = COMMAND_STREAM_KEY) -> None:
        self.service = service
        self.stream_key = stream_key
        self._task: Optional[asyncio.Task] = None
        self._stopped = asyncio.Event()
        self._last_id = "0-0"

    def start(self) -> None:
        self._stopped.clear()
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped.set()
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None

    async def _run(self) -> None:
        while not self._stopped.is_set():
            redis = self.service.redis
            if redis is None:
                await asyncio.sleep(1)
                continue
            try:
                entries = await redis.xread({self.stream_key: self._last_id}, count=10, block=1000)
                for _stream_name, messages in entries or []:
                    for message_id, fields in messages:
                        self._last_id = message_id
                        await self._handle(fields)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"[game-worker] command processing failed: {exc}")
                await asyncio.sleep(1)

    async def _handle(self, fields: dict[str, Any]) -> None:
        action = str(fields.get("action") or "")
        if action == "finish_room":
            await self.service.finish_room(
                room_id=str(fields.get("room_id") or ""),
                user_id=str(fields.get("user_id") or ""),
            )
        elif action == "game_command":
            await self.service.apply_game_command(fields)


def _iso_to_epoch(value: Any) -> float:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp()
    except (TypeError, ValueError):
        return time.time()
