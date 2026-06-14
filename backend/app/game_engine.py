from __future__ import annotations

import copy
import random
import time
from typing import Any

from .game_config_loader import GameConfigRepository, get_game_config


DIRECTIONS = [
    {"q": 1, "r": 0, "name": "E"},
    {"q": 0, "r": 1, "name": "SE"},
    {"q": -1, "r": 1, "name": "SW"},
    {"q": -1, "r": 0, "name": "W"},
    {"q": 0, "r": -1, "name": "NW"},
    {"q": 1, "r": -1, "name": "NE"},
]


def hex_key(q: int, r: int) -> str:
    return f"{q},{r}"


def hex_distance(q1: int, r1: int, q2: int, r2: int) -> int:
    return int((abs(q1 - q2) + abs(q1 + r1 - q2 - r2) + abs(r1 - r2)) / 2)


def neighbors(q: int, r: int) -> list[dict[str, int]]:
    return [
        {"q": q + direction["q"], "r": r + direction["r"], "dir_index": index}
        for index, direction in enumerate(DIRECTIONS)
    ]


def _angular_distance(dir1: int, dir2: int) -> int:
    diff = abs(dir1 - dir2)
    return min(diff, 6 - diff)


class GameEngine:
    def __init__(self, config: GameConfigRepository | None = None) -> None:
        self.config = config or get_game_config()
        self.rules = self.config.rules

    def create_initial_state(self, *, seed: int | None = None) -> dict[str, Any]:
        actual_seed = int(seed if seed is not None else time.time_ns() % 2_147_483_647)
        rng = random.Random(actual_seed)
        radius = int(self.rules["map_radius"])
        grid: dict[str, dict[str, Any]] = {}
        for q in range(-radius, radius + 1):
            min_r = max(-radius, -q - radius)
            max_r = min(radius, -q + radius)
            for r in range(min_r, max_r + 1):
                grid[hex_key(q, r)] = {
                    "q": q,
                    "r": r,
                    "terrain": "neutral",
                    "hydration": 0,
                    "building": None,
                    "building_upgrade": None,
                    "stress": 0,
                    "terrain_stress": 0,
                }

        core_key = hex_key(int(self.rules["core_start_q"]), int(self.rules["core_start_r"]))
        grid[core_key]["building"] = "core"

        hexes = list(grid.values())
        distant_hexes = [h for h in hexes if hex_distance(0, 0, h["q"], h["r"]) >= 2]
        edge_hexes = [h for h in hexes if hex_distance(0, 0, h["q"], h["r"]) == radius]

        available = distant_hexes[:]
        self._assign_random(available, rng, int(self.rules["initial_rocks"]), lambda h: h.update({"terrain": "rock"}))
        self._assign_random(
            available,
            rng,
            int(self.rules["initial_forests"]),
            lambda h: h.update({"terrain": "forest", "hydration": int(self.config.terrains["forest"]["initial_hydration"])}),
        )
        self._assign_random(
            available,
            rng,
            int(self.rules["initial_moist_tiles"]),
            lambda h: h.update({"hydration": rng.randint(1, int(self.rules["hydration_max"]))}),
        )
        edge_available = edge_hexes[:]
        self._assign_random(
            edge_available,
            rng,
            int(self.rules["initial_drought_centers"]),
            lambda h: h.update({"hydration": int(self.rules["hydration_min"])}),
        )

        base_economy = self.calculate_economy(grid)
        return {
            "schema_version": 1,
            "config_id": self.rules["id"],
            "seed": actual_seed,
            "revision": 0,
            "phase": "IN_GAME",
            "game_over": None,
            "season": 1,
            "wind_dir": rng.randrange(0, len(DIRECTIONS)),
            "actions_left": int(self.rules["actions_per_season"]),
            "maturity": 0,
            "base_economy": base_economy,
            "spent_life": 0,
            "last_command_timestamp_ms": 0,
            "logs": ["Colony initialized."],
            "grid": grid,
        }

    def public_state(self, state: dict[str, Any], *, selected_tile: str | None = None) -> dict[str, Any]:
        live_economy = self.calculate_economy(state["grid"])
        base_economy = state.get("base_economy") or {"prod": 0, "sustain": 0}
        available_life = max(0, int(base_economy["prod"]) - int(base_economy["sustain"])) - int(state.get("spent_life") or 0)
        selected = state["grid"].get(selected_tile or "")
        return {
            "revision": int(state.get("revision") or 0),
            "phase": state.get("phase", "IN_GAME"),
            "game_over": state.get("game_over"),
            "season": int(state.get("season") or 1),
            "max_seasons": int(self.rules["max_seasons"]),
            "target_maturity": int(self.rules["target_maturity"]),
            "wind_dir": int(state.get("wind_dir") or 0),
            "wind_label": DIRECTIONS[int(state.get("wind_dir") or 0)]["name"],
            "actions_left": int(state.get("actions_left") or 0),
            "maturity": int(state.get("maturity") or 0),
            "base_economy": base_economy,
            "live_economy": live_economy,
            "available_life": available_life,
            "logs": list(state.get("logs") or [])[:8],
            "grid": state["grid"],
            "config": self.config.public_payload(),
            "selected_tile": selected,
            "available_actions": self.available_actions(state, selected_tile=selected_tile),
        }

    def apply_command(self, state: dict[str, Any], command: dict[str, Any]) -> dict[str, Any]:
        next_state = copy.deepcopy(state)
        if next_state.get("phase") != "IN_GAME":
            return next_state
        command_type = str(command.get("type") or "")
        if command_type == "build":
            self._apply_build(next_state, command)
        elif command_type == "repair":
            self._apply_repair(next_state, command)
        elif command_type == "upgrade":
            self._apply_upgrade(next_state, command)
        elif command_type == "end_season":
            self._apply_end_season(next_state)
        else:
            raise ValueError("Unknown command type.")
        next_state["last_command_timestamp_ms"] = int(command.get("client_timestamp_ms") or 0)
        next_state["revision"] = int(next_state.get("revision") or 0) + 1
        return next_state

    def validate_command(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        if state.get("phase") != "IN_GAME":
            raise ValueError("Game is not active.")
        expected_revision = command.get("expected_revision")
        if expected_revision is not None and int(expected_revision) != int(state.get("revision") or 0):
            raise ValueError("Command targets a stale game revision.")
        client_timestamp_ms = int(command.get("client_timestamp_ms") or 0)
        if client_timestamp_ms and client_timestamp_ms < int(state.get("last_command_timestamp_ms") or 0):
            raise ValueError("Command is older than the latest accepted command.")

        command_type = str(command.get("type") or "")
        if command_type == "end_season":
            return
        if command_type == "finish_room":
            return
        tile_key = str(command.get("tile_key") or "")
        actions = self.available_actions(state, selected_tile=tile_key)
        if command_type == "build":
            building_type = str(command.get("building_type") or "")
            if not any(action["type"] == "build" and action.get("building_type") == building_type for action in actions):
                raise ValueError("Build command is not legal.")
        elif command_type == "repair":
            if not any(action["type"] == "repair" for action in actions):
                raise ValueError("Repair command is not legal.")
        elif command_type == "upgrade":
            upgrade_id = str(command.get("upgrade_id") or "")
            if not any(action["type"] == "upgrade" and action.get("upgrade_id") == upgrade_id for action in actions):
                raise ValueError("Upgrade command is not legal.")
        else:
            raise ValueError("Unknown command type.")

    def available_actions(self, state: dict[str, Any], *, selected_tile: str | None) -> list[dict[str, Any]]:
        if state.get("phase") != "IN_GAME":
            return []
        actions: list[dict[str, Any]] = []
        hex_state = state["grid"].get(selected_tile or "")
        if not hex_state:
            return actions
        available_life = self._available_life(state)
        actions_left = int(state.get("actions_left") or 0)
        if hex_state.get("building") is None:
            for building_id, building in self.config.buildings.items():
                if not building.get("build_cost_actions"):
                    continue
                cost_actions = int(building.get("build_cost_actions") or 1)
                cost_life = int(building.get("build_cost_life") or 0)
                legal = (
                    actions_left >= cost_actions
                    and available_life >= cost_life
                    and self._can_build_on(state, hex_state, building)
                )
                if legal:
                    actions.append(
                        {
                            "type": "build",
                            "building_type": building_id,
                            "label": f"Grow {building['label']}",
                            "cost_life": cost_life,
                            "cost_actions": cost_actions,
                        }
                    )
            return actions

        if hex_state.get("building") != "core" and int(hex_state.get("stress") or 0) > 0 and actions_left >= 1:
            actions.append({"type": "repair", "label": "Repair", "cost_actions": 1, "cost_life": 0})

        if hex_state.get("building_upgrade"):
            return actions
        building = self.config.buildings.get(str(hex_state.get("building") or ""))
        for upgrade_id in building.get("upgrade_ids", []) if building else []:
            upgrade = self.config.upgrades.get(upgrade_id)
            if not upgrade:
                continue
            cost_actions = int(upgrade.get("cost_actions") or 1)
            cost_life = int(upgrade.get("cost_life") or 0)
            if actions_left >= cost_actions and available_life >= cost_life:
                actions.append(
                    {
                        "type": "upgrade",
                        "upgrade_id": upgrade_id,
                        "label": upgrade["label"],
                        "cost_life": cost_life,
                        "cost_actions": cost_actions,
                    }
                )
        return actions

    def calculate_economy(self, grid: dict[str, dict[str, Any]]) -> dict[str, int]:
        prod = 0
        sustain = 0
        for hex_state in grid.values():
            building_id = hex_state.get("building")
            if not building_id:
                continue
            building = self.config.buildings.get(str(building_id), {})
            upgrade = self.config.upgrades.get(str(hex_state.get("building_upgrade") or ""), {})
            sustain += int(building.get("sustain_cost") or 0)
            life_prod = int(upgrade.get("life_production_override") or building.get("life_production") or 0)
            if not life_prod:
                life_prod = self._life_by_hydration(building, int(hex_state.get("hydration") or 0))
            if upgrade.get("life_bonus_if_hydration_min") is not None and int(hex_state.get("hydration") or 0) >= int(upgrade["life_bonus_if_hydration_min"]):
                life_prod += int(upgrade.get("life_bonus") or 0)
            prod += life_prod
        return {"prod": prod, "sustain": sustain}

    def _apply_build(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        tile_key = str(command.get("tile_key") or "")
        building_type = str(command.get("building_type") or "")
        building = self.config.buildings[building_type]
        tile = state["grid"][tile_key]
        tile.update({"building": building_type, "building_upgrade": None, "stress": 0})
        state["actions_left"] = int(state["actions_left"]) - int(building.get("build_cost_actions") or 1)
        state["spent_life"] = int(state.get("spent_life") or 0) + int(building.get("build_cost_life") or 0)
        self._add_log(state, f"Built {building['label']} at {tile['q']},{tile['r']}.")

    def _apply_repair(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        tile = state["grid"][str(command.get("tile_key") or "")]
        tile["stress"] = max(0, int(tile.get("stress") or 0) - 1)
        state["actions_left"] = int(state["actions_left"]) - 1
        self._add_log(state, f"Repaired structure at {tile['q']},{tile['r']}.")

    def _apply_upgrade(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        tile = state["grid"][str(command.get("tile_key") or "")]
        upgrade_id = str(command.get("upgrade_id") or "")
        upgrade = self.config.upgrades[upgrade_id]
        tile["building_upgrade"] = upgrade_id
        if upgrade.get("instant_hydration_delta"):
            tile["hydration"] = self._clamp_hydration(int(tile["hydration"]) + int(upgrade["instant_hydration_delta"]), tile.get("terrain"))
        state["actions_left"] = int(state["actions_left"]) - int(upgrade.get("cost_actions") or 1)
        state["spent_life"] = int(state.get("spent_life") or 0) + int(upgrade.get("cost_life") or 0)
        self._add_log(state, f"Upgraded to {upgrade['label']} at {tile['q']},{tile['r']}.")

    def _apply_end_season(self, state: dict[str, Any]) -> None:
        rng = self._rng_for(state, "end_season")
        turn_logs: list[str] = []
        season = int(state["season"])
        if season > 1 and season % 2 != 0:
            state["wind_dir"] = rng.randrange(0, len(DIRECTIONS))
            turn_logs.append(f"Wind shifted to {DIRECTIONS[state['wind_dir']]['name']}.")

        self._resolve_condensers(state, rng)
        if season % 2 == 0:
            self._resolve_drought(state, rng)
            turn_logs.append("Drought replicated.")

        projected_economy = self.calculate_economy(state["grid"])
        if projected_economy["sustain"] > projected_economy["prod"]:
            deficit = projected_economy["sustain"] - projected_economy["prod"]
            turn_logs.append(f"Deficit of {deficit} Life. Structures strained.")
            active_buildings = [
                tile for tile in state["grid"].values()
                if tile.get("building") and tile.get("building") != "core"
            ]
            for _ in range(deficit):
                if active_buildings:
                    rng.choice(active_buildings)["stress"] += 1

        core_died = self._resolve_stress_and_maturity(state, turn_logs)
        state["season"] = season + 1
        state["actions_left"] = int(self.rules["actions_per_season"])
        state["spent_life"] = 0
        state["base_economy"] = self.calculate_economy(state["grid"])
        for message in reversed(turn_logs):
            self._add_log(state, message)

        if core_died:
            state["game_over"] = "lose"
            state["phase"] = "FINISHED"
        elif int(state["maturity"]) >= int(self.rules["target_maturity"]):
            state["game_over"] = "win"
            state["phase"] = "FINISHED"
        elif season >= int(self.rules["max_seasons"]):
            state["game_over"] = "lose"
            state["phase"] = "FINISHED"

    def _resolve_condensers(self, state: dict[str, Any], rng: random.Random) -> None:
        for tile in list(state["grid"].values()):
            if tile.get("building") != "condenser":
                continue
            building = self.config.buildings["condenser"]
            upgrade = self.config.upgrades.get(str(tile.get("building_upgrade") or ""), {})
            iterations = int(upgrade.get("hydration_push_iterations_override") or building.get("hydration_push_iterations") or 1)
            for _ in range(iterations):
                candidates = []
                min_hydration = 999
                for neighbor in neighbors(tile["q"], tile["r"]):
                    target = state["grid"].get(hex_key(neighbor["q"], neighbor["r"]))
                    if not target:
                        continue
                    delta = abs(int(tile["hydration"]) - int(target["hydration"]))
                    if target.get("terrain") == "rock" and delta < int(self.config.terrains["rock"]["hydration_delta_threshold"]):
                        continue
                    hydration = int(target["hydration"])
                    if hydration < min_hydration:
                        min_hydration = hydration
                        candidates = [{"target": target, "dir_index": neighbor["dir_index"]}]
                    elif hydration == min_hydration:
                        candidates.append({"target": target, "dir_index": neighbor["dir_index"]})
                if candidates:
                    target = self._resolve_wind_tie(candidates, int(state["wind_dir"]), rng)["target"]
                    target["hydration"] = self._clamp_hydration(int(target["hydration"]) + 1, target.get("terrain"))

    def _resolve_drought(self, state: dict[str, Any], rng: random.Random) -> None:
        sources = [copy.copy(tile) for tile in state["grid"].values() if int(tile.get("hydration") or 0) <= -1]
        rng.shuffle(sources)
        for source in sources:
            tile = state["grid"][hex_key(source["q"], source["r"])]
            candidates = []
            max_hydration = -999
            for neighbor in neighbors(tile["q"], tile["r"]):
                target = state["grid"].get(hex_key(neighbor["q"], neighbor["r"]))
                if not target:
                    continue
                delta = int(target["hydration"]) - int(tile["hydration"])
                if delta <= 0:
                    continue
                if target.get("terrain") == "rock" and delta < int(self.config.terrains["rock"]["hydration_delta_threshold"]):
                    continue
                forest_config = self.config.terrains["forest"]
                if (self._is_forest_aura(state, target) or self._is_forest_aura(state, tile)) and delta < int(forest_config["drought_resistance_delta"]):
                    continue
                hydration = int(target["hydration"])
                if hydration > max_hydration:
                    max_hydration = hydration
                    candidates = [{"target": target, "dir_index": neighbor["dir_index"]}]
                elif hydration == max_hydration:
                    candidates.append({"target": target, "dir_index": neighbor["dir_index"]})
            if candidates:
                target = self._resolve_wind_tie(candidates, int(state["wind_dir"]), rng)["target"]
                target["hydration"] = self._clamp_hydration(int(target["hydration"]) - 1, target.get("terrain"))
            else:
                tile["hydration"] = self._clamp_hydration(int(tile["hydration"]) - 1, tile.get("terrain"))

    def _resolve_stress_and_maturity(self, state: dict[str, Any], turn_logs: list[str]) -> bool:
        core_died = False
        for tile in state["grid"].values():
            if tile.get("terrain") == "forest":
                forest = self.config.terrains["forest"]
                if int(tile["hydration"]) <= int(forest["wither_hydration_max"]):
                    tile["terrain_stress"] = int(tile.get("terrain_stress") or 0) + 1
                if int(tile.get("terrain_stress") or 0) >= int(forest["wither_stress_threshold"]):
                    tile["terrain"] = "neutral"
                    turn_logs.append(f"Forest at {tile['q']},{tile['r']} withered.")

            building_id = tile.get("building")
            if not building_id:
                continue
            got_stress = False
            building = self.config.buildings[str(building_id)]
            for rule in building.get("stress_by_hydration", []):
                if int(tile["hydration"]) <= int(rule["max"]):
                    tile["stress"] = int(tile.get("stress") or 0) + int(rule["stress"])
                    got_stress = True
                    break
            if int(tile.get("stress") or 0) >= int(self.rules["stress_collapse_threshold"]):
                if building_id == "core":
                    core_died = True
                turn_logs.append(f"{building['label']} at {tile['q']},{tile['r']} collapsed.")
                tile.update({"building": None, "building_upgrade": None, "stress": 0})
                continue
            state["maturity"] = int(state.get("maturity") or 0) + self._maturity_for_tile(tile, got_stress=got_stress)
        return core_died

    def _maturity_for_tile(self, tile: dict[str, Any], *, got_stress: bool) -> int:
        building = self.config.buildings.get(str(tile.get("building") or ""), {})
        upgrade = self.config.upgrades.get(str(tile.get("building_upgrade") or ""), {})
        maturity = int(building.get("maturity_per_season") or 0)
        if building.get("maturity_if_hydration_min") is not None and int(tile["hydration"]) >= int(building["maturity_if_hydration_min"]) and not got_stress:
            maturity += 1
        if upgrade.get("maturity_bonus_if_hydration") is not None and int(tile["hydration"]) == int(upgrade["maturity_bonus_if_hydration"]):
            maturity += int(upgrade.get("maturity_bonus") or 0)
        else:
            maturity += int(upgrade.get("maturity_bonus") or 0) if upgrade.get("maturity_bonus_if_hydration") is None else 0
        return maturity

    def _can_build_on(self, state: dict[str, Any], tile: dict[str, Any], building: dict[str, Any]) -> bool:
        if tile.get("building") is not None:
            return False
        if building.get("requires_terrain") and tile.get("terrain") != building["requires_terrain"]:
            return False
        if building.get("requires_hydration_min") is not None and int(tile.get("hydration") or 0) < int(building["requires_hydration_min"]):
            return False
        if building.get("requires_adjacent_colony"):
            return any(
                state["grid"].get(hex_key(neighbor["q"], neighbor["r"]), {}).get("building") is not None
                for neighbor in neighbors(tile["q"], tile["r"])
            )
        return True

    def _life_by_hydration(self, building: dict[str, Any], hydration: int) -> int:
        for rule in building.get("life_production_by_hydration", []):
            if hydration >= int(rule["min"]):
                return int(rule["value"])
        return 0

    def _available_life(self, state: dict[str, Any]) -> int:
        base = state.get("base_economy") or {"prod": 0, "sustain": 0}
        return max(0, int(base["prod"]) - int(base["sustain"])) - int(state.get("spent_life") or 0)

    def _is_forest_aura(self, state: dict[str, Any], tile: dict[str, Any]) -> bool:
        if tile.get("terrain") == "forest":
            return True
        return any(
            state["grid"].get(hex_key(neighbor["q"], neighbor["r"]), {}).get("terrain") == "forest"
            for neighbor in neighbors(tile["q"], tile["r"])
        )

    def _resolve_wind_tie(self, candidates: list[dict[str, Any]], wind_dir: int, rng: random.Random) -> dict[str, Any]:
        best_angular = min(_angular_distance(int(candidate["dir_index"]), wind_dir) for candidate in candidates)
        tied = [candidate for candidate in candidates if _angular_distance(int(candidate["dir_index"]), wind_dir) == best_angular]
        return rng.choice(tied)

    def _clamp_hydration(self, hydration: int, terrain: Any) -> int:
        terrain_config = self.config.terrains.get(str(terrain or "neutral"), {})
        lower = int(terrain_config.get("hydration_min", self.rules["hydration_min"]))
        upper = int(terrain_config.get("hydration_max", self.rules["hydration_max"]))
        return max(lower, min(upper, hydration))

    def _rng_for(self, state: dict[str, Any], label: str) -> random.Random:
        seed = f"{state.get('seed')}:{state.get('season')}:{state.get('revision')}:{label}"
        return random.Random(seed)

    @staticmethod
    def _assign_random(available: list[dict[str, Any]], rng: random.Random, count: int, mutator) -> None:
        for _ in range(count):
            if not available:
                return
            index = rng.randrange(0, len(available))
            item = available.pop(index)
            mutator(item)

    @staticmethod
    def _add_log(state: dict[str, Any], message: str) -> None:
        state["logs"] = [message, *list(state.get("logs") or [])][:8]
