from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any

from .server_models import User


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _creation_key(creation_id: str) -> str:
    return f"game:creation:{creation_id}"


def _user_creations_key(user_id: str) -> str:
    return f"game:user:{user_id}:creations"


def _published_creations_key() -> str:
    return "game:creations:published"


def _public_creation(payload: dict[str, Any], *, include_payload: bool = True) -> dict[str, Any]:
    result = {
        "id": payload.get("id", ""),
        "owner_user_id": payload.get("owner_user_id", ""),
        "owner_username": payload.get("owner_username", ""),
        "name": payload.get("name", "Untitled Creation"),
        "description": payload.get("description", ""),
        "status": payload.get("status", "draft"),
        "created_at": payload.get("created_at", ""),
        "updated_at": payload.get("updated_at", ""),
        "published_at": payload.get("published_at") or None,
    }
    if include_payload:
        result["payload"] = _decode_payload(payload.get("payload"))
    return result


def _decode_payload(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return default_creation_payload()
    try:
        return json.loads(str(raw))
    except (TypeError, ValueError):
        return default_creation_payload()


def _encode_payload(payload: dict[str, Any]) -> str:
    normalized = normalize_creation_payload(payload)
    return json.dumps(normalized, separators=(",", ":"), sort_keys=True)


def default_creation_payload() -> dict[str, Any]:
    return {
        "version": 1,
        "tiles": {},
        "goals": {
            "mode": "all",
            "survive_phases": 25,
            "target_maturity": 1000,
        },
        "wind": {
            "mode": "random",
            "schedule": [],
        },
        "events": [],
    }


def normalize_creation_payload(payload: dict[str, Any] | None) -> dict[str, Any]:
    source = payload or {}
    goals = source.get("goals") or {}
    wind = source.get("wind") or {}
    normalized_tiles: dict[str, dict[str, Any]] = {}
    for key, value in (source.get("tiles") or {}).items():
        if not isinstance(value, dict):
            continue
        tile: dict[str, Any] = {}
        for field in ("terrain", "hydration", "nutrient_type", "building", "building_upgrade"):
            if field in value:
                tile[field] = value[field]
        if "hydration" in tile:
            tile["hydration"] = int(tile["hydration"])
        terrain_value = str(tile.get("terrain") or "")
        is_real_tile = (
            (("terrain" in tile) and terrain_value not in {"", "__empty"})
            or int(tile.get("hydration") or 0) != 0
            or bool(tile.get("nutrient_type"))
            or bool(tile.get("building"))
            or bool(tile.get("building_upgrade"))
        )
        if tile and is_real_tile:
            normalized_tiles[str(key)] = tile
    wind_schedule = []
    for item in wind.get("schedule") or []:
        if not isinstance(item, dict):
            continue
        try:
            season = max(1, int(item.get("season") or 1))
        except (TypeError, ValueError):
            continue
        direction = str(item.get("direction") or item.get("wind") or "").upper()
        if direction in {"E", "SE", "SW", "W", "NW", "NE"}:
            wind_schedule.append({"season": season, "direction": direction})
    wind_schedule.sort(key=lambda item: item["season"])
    events = []
    for item in source.get("events") or []:
        if not isinstance(item, dict):
            continue
        event_type = str(item.get("type") or "sudden_drought")
        if event_type != "sudden_drought":
            continue
        try:
            season = max(1, int(item.get("season") or item.get("trigger_season") or 1))
            severity = max(1, min(4, int(item.get("severity") or 1)))
        except (TypeError, ValueError):
            continue
        events.append({
            "id": str(item.get("id") or f"sudden_drought_{season}_{severity}"),
            "type": "sudden_drought",
            "season": season,
            "severity": severity,
            "revealed": bool(item.get("revealed", True)),
        })
    events.sort(key=lambda item: (item["season"], item["severity"]))
    return {
        "version": 1,
        "tiles": normalized_tiles,
        "goals": {
            "mode": str(goals.get("mode") or "all"),
            "survive_phases": int(goals.get("survive_phases") or 25),
            "target_maturity": int(goals.get("target_maturity") or 1000),
        },
        "wind": {
            "mode": "scheduled" if str(wind.get("mode") or "random") == "scheduled" else "random",
            "schedule": wind_schedule,
        },
        "events": events,
    }


class CreationService:
    def __init__(self, redis_client=None) -> None:
        self.redis = redis_client
        self._memory_creations: dict[str, dict[str, Any]] = {}
        self._memory_user_index: dict[str, list[str]] = {}

    def configure_redis(self, redis_client) -> None:
        self.redis = redis_client

    async def create_creation(self, *, user: User, name: str, description: str = "", payload: dict[str, Any] | None = None) -> dict[str, Any]:
        creation_id = f"creation_{uuid.uuid4().hex[:16]}"
        now = _now_iso()
        creation = {
            "id": creation_id,
            "owner_user_id": user.id,
            "owner_username": user.username or user.email or user.id,
            "name": str(name or "Untitled Creation").strip() or "Untitled Creation",
            "description": str(description or ""),
            "status": "draft",
            "created_at": now,
            "updated_at": now,
            "published_at": "",
            "payload": _encode_payload(payload or default_creation_payload()),
        }
        await self._save_creation(creation)
        return _public_creation(creation)

    async def list_user_creations(self, *, user_id: str) -> list[dict[str, Any]]:
        creations = await self._list_by_user(user_id)
        return [_public_creation(item, include_payload=False) for item in creations]

    async def list_published_creations(self) -> list[dict[str, Any]]:
        creations = await self._list_published()
        return [_public_creation(item, include_payload=False) for item in creations]

    async def get_creation(self, *, creation_id: str, user: User | None = None, require_published: bool = False) -> dict[str, Any] | None:
        creation = await self._load_creation(creation_id)
        if not creation:
            return None
        if require_published and creation.get("status") != "published":
            return None
        if user is not None and creation.get("owner_user_id") != user.id:
            return None
        return _public_creation(creation)

    async def update_creation(
        self,
        *,
        creation_id: str,
        user: User,
        name: str | None = None,
        description: str | None = None,
        payload: dict[str, Any] | None = None,
        publish: bool | None = None,
    ) -> dict[str, Any] | None:
        creation = await self._load_creation(creation_id)
        if not creation or creation.get("owner_user_id") != user.id:
            return None
        if name is not None:
            creation["name"] = str(name or "Untitled Creation").strip() or "Untitled Creation"
        if description is not None:
            creation["description"] = str(description or "")
        if payload is not None:
            creation["payload"] = _encode_payload(payload)
        if publish is not None:
            creation["status"] = "published" if publish else "draft"
            creation["published_at"] = _now_iso() if publish else ""
        creation["updated_at"] = _now_iso()
        await self._save_creation(creation)
        return _public_creation(creation)

    async def delete_creation(self, *, creation_id: str, user: User) -> bool:
        creation = await self._load_creation(creation_id)
        if not creation or creation.get("owner_user_id") != user.id:
            return False
        if self.redis is None:
            self._memory_creations.pop(creation_id, None)
            self._memory_user_index[user.id] = [item for item in self._memory_user_index.get(user.id, []) if item != creation_id]
            return True
        await self.redis.delete(_creation_key(creation_id))
        await self.redis.zrem(_user_creations_key(user.id), creation_id)
        await self.redis.zrem(_published_creations_key(), creation_id)
        return True

    async def _save_creation(self, creation: dict[str, Any]) -> None:
        if self.redis is None:
            self._memory_creations[creation["id"]] = creation
            self._memory_user_index.setdefault(creation["owner_user_id"], [])
            if creation["id"] not in self._memory_user_index[creation["owner_user_id"]]:
                self._memory_user_index[creation["owner_user_id"]].append(creation["id"])
            return
        await self.redis.hset(_creation_key(creation["id"]), mapping=creation)
        await self.redis.zadd(_user_creations_key(creation["owner_user_id"]), {creation["id"]: time.time()})
        if creation.get("status") == "published":
            await self.redis.zadd(_published_creations_key(), {creation["id"]: time.time()})
        else:
            await self.redis.zrem(_published_creations_key(), creation["id"])

    async def _load_creation(self, creation_id: str) -> dict[str, Any] | None:
        if self.redis is None:
            return self._memory_creations.get(creation_id)
        creation = await self.redis.hgetall(_creation_key(creation_id))
        return dict(creation) if creation else None

    async def _list_by_user(self, user_id: str) -> list[dict[str, Any]]:
        if self.redis is None:
            ids = list(reversed(self._memory_user_index.get(user_id, [])))
        else:
            ids = await self.redis.zrevrange(_user_creations_key(user_id), 0, 99)
        return [creation for creation_id in ids if (creation := await self._load_creation(str(creation_id)))]

    async def _list_published(self) -> list[dict[str, Any]]:
        if self.redis is None:
            return [item for item in self._memory_creations.values() if item.get("status") == "published"]
        ids = await self.redis.zrevrange(_published_creations_key(), 0, 99)
        return [creation for creation_id in ids if (creation := await self._load_creation(str(creation_id)))]
