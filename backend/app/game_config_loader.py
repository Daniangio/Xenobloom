from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


CONFIG_ROOT = Path(__file__).resolve().parent / "game_configs"


class GameConfigRepository:
    def __init__(self, root: Path = CONFIG_ROOT) -> None:
        self.root = root
        self.rules = self._load_json(root / "rules" / "base.json")
        self.terrains = self._load_directory(root / "terrain")
        self.buildings = self._load_directory(root / "buildings")
        self.upgrades = self._load_directory(root / "upgrades")

    def public_payload(self) -> dict[str, Any]:
        return {
            "rules": self.rules,
            "terrains": self.terrains,
            "buildings": self.buildings,
            "upgrades": self.upgrades,
        }

    @staticmethod
    def _load_json(path: Path) -> dict[str, Any]:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _load_directory(self, path: Path) -> dict[str, dict[str, Any]]:
        entries: dict[str, dict[str, Any]] = {}
        for file_path in sorted(path.glob("*.json")):
            payload = self._load_json(file_path)
            entries[str(payload["id"])] = payload
        return entries


@lru_cache(maxsize=1)
def get_game_config() -> GameConfigRepository:
    return GameConfigRepository()
