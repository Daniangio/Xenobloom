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
NUTRIENT_TYPES = ("green", "blue", "purple")


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

    def create_initial_state(self, *, seed: int | None = None, creation: dict[str, Any] | None = None) -> dict[str, Any]:
        actual_seed = int(seed if seed is not None else time.time_ns() % 2_147_483_647)
        rng = random.Random(actual_seed)
        creation_payload = creation or {}
        creation_tiles = creation_payload.get("tiles") or {}
        creation_goals = creation_payload.get("goals") or {}
        creation_radius = 0
        for key in creation_tiles:
            try:
                q, r = [int(part) for part in str(key).split(",", 1)]
            except ValueError:
                continue
            creation_radius = max(creation_radius, hex_distance(0, 0, q, r))
        radius = max(int(self.rules["map_radius"]), creation_radius + 2)
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
                    "nutrient_type": None,
                    "extraction_progress": 0,
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
        nutrient_available = [
            h for h in hexes
            if h.get("building") is None
            and h.get("terrain") != "rock"
            and h.get("nutrient_type") is None
            and hex_distance(0, 0, h["q"], h["r"]) >= 2
        ]
        for nutrient_type in NUTRIENT_TYPES:
            self._assign_random(
                nutrient_available,
                rng,
                int(self.rules["initial_nutrients_per_type"]),
                lambda h, nutrient_type=nutrient_type: h.update({"nutrient_type": nutrient_type}),
            )

        if creation:
            for tile in grid.values():
                tile.update({
                    "terrain": "neutral",
                    "hydration": 0,
                    "building": None,
                    "building_upgrade": None,
                    "stress": 0,
                    "terrain_stress": 0,
                    "nutrient_type": None,
                    "extraction_progress": 0,
                })
            for key, override in creation_tiles.items():
                try:
                    q, r = [int(part) for part in str(key).split(",", 1)]
                except ValueError:
                    continue
                tile = grid.setdefault(
                    hex_key(q, r),
                    {
                        "q": q,
                        "r": r,
                        "terrain": "neutral",
                        "hydration": 0,
                        "building": None,
                        "building_upgrade": None,
                        "stress": 0,
                        "terrain_stress": 0,
                        "nutrient_type": None,
                        "extraction_progress": 0,
                    },
                )
                for field in ("terrain", "hydration", "nutrient_type", "building", "building_upgrade"):
                    if field in override:
                        tile[field] = override[field]
                tile["hydration"] = self._clamp_hydration(int(tile.get("hydration") or 0), tile.get("terrain"))
            if not any(tile.get("building") == "core" for tile in grid.values()):
                grid[core_key]["building"] = "core"

        initial_state = {
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
            "goals": {
                "mode": str(creation_goals.get("mode") or "all"),
                "survive_phases": int(creation_goals.get("survive_phases") or self.rules["max_seasons"]),
                "target_maturity": int(creation_goals.get("target_maturity") or self.rules["target_maturity"]),
            },
            "base_economy": {"prod": 0, "sustain": 0},
            "spent_life": 0,
            "strains": {nutrient_type: 0 for nutrient_type in NUTRIENT_TYPES},
            "global_upgrades": {
                "composting": False,
                "autonomous_assimilators": False,
                "autonomous_connectors": False,
                "autonomous_condensers": False,
                "autonomous_blooms": False,
            },
            "last_command_timestamp_ms": 0,
            "logs": ["Colony initialized."],
            "grid": grid,
        }
        initial_state["base_economy"] = self.calculate_economy(grid, state=initial_state)
        return {
            **initial_state,
        }

    def public_state(self, state: dict[str, Any], *, selected_tile: str | None = None) -> dict[str, Any]:
        live_economy = self.calculate_economy(state["grid"], state=state)
        base_economy = state.get("base_economy") or {"prod": 0, "sustain": 0}
        available_life = max(0, int(base_economy["prod"]) - int(base_economy["sustain"])) - int(state.get("spent_life") or 0)
        selected = state["grid"].get(selected_tile or "")
        connected_keys = self._connected_building_keys(state)
        strains = self._strain_counts(state)
        goals = self._goals(state)
        return {
            "revision": int(state.get("revision") or 0),
            "phase": state.get("phase", "IN_GAME"),
            "game_over": state.get("game_over"),
            "season": int(state.get("season") or 1),
            "max_seasons": int(goals["survive_phases"]),
            "target_maturity": int(goals["target_maturity"]),
            "wind_dir": int(state.get("wind_dir") or 0),
            "wind_label": DIRECTIONS[int(state.get("wind_dir") or 0)]["name"],
            "actions_left": int(state.get("actions_left") or 0),
            "maturity": int(state.get("maturity") or 0),
            "strains": strains,
            "strain_maturity": self._strain_maturity(strains),
            "global_upgrades": self._global_upgrades(state),
            "base_economy": base_economy,
            "live_economy": live_economy,
            "resources": self._resource_summary(state, live_economy=live_economy),
            "available_life": available_life,
            "logs": list(state.get("logs") or [])[:8],
            "grid": state["grid"],
            "config": self.config.public_payload(),
            "selected_tile": selected,
            "selected_element": self._element_summary(selected, state=state, connected_keys=connected_keys) if selected else None,
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
        elif command_type == "global_upgrade":
            self._apply_global_upgrade(next_state, command)
        elif command_type == "dismantle":
            self._apply_dismantle(next_state, command, compost=False)
        elif command_type == "compost":
            self._apply_dismantle(next_state, command, compost=True)
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
        elif command_type == "global_upgrade":
            upgrade_id = str(command.get("upgrade_id") or "")
            if not any(action["type"] == "global_upgrade" and action.get("upgrade_id") == upgrade_id for action in actions):
                raise ValueError("Global upgrade command is not legal.")
        elif command_type == "dismantle":
            if not any(action["type"] == "dismantle" for action in actions):
                raise ValueError("Dismantle command is not legal.")
        elif command_type == "compost":
            if not any(action["type"] == "compost" for action in actions):
                raise ValueError("Compost command is not legal.")
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
                            "element": self._element_summary({**hex_state, "building": building_id, "building_upgrade": None}),
                        }
                    )
            return actions

        if hex_state.get("building") != "core" and int(hex_state.get("stress") or 0) > 0 and actions_left >= 1:
            actions.append({"type": "repair", "label": "Repair", "cost_actions": 1, "cost_life": 0})

        if hex_state.get("building") != "core" and actions_left >= 1:
            action_type = "compost" if self._global_upgrades(state).get("composting") else "dismantle"
            actions.append(
                {
                    "type": action_type,
                    "label": "Compost" if action_type == "compost" else "Dismantle",
                    "cost_actions": 1,
                    "cost_life": 0,
                }
            )

        if hex_state.get("building") == "core":
            active_globals = self._global_upgrades(state)
            for upgrade_id, upgrade in self.config.global_upgrades.items():
                if active_globals.get(upgrade_id):
                    continue
                cost_actions = int(upgrade.get("cost_actions") or 1)
                cost_life = int(upgrade.get("cost_life") or 0)
                if actions_left >= cost_actions and available_life >= cost_life:
                    actions.append(
                        {
                            "type": "global_upgrade",
                            "upgrade_id": upgrade_id,
                            "label": upgrade["label"],
                            "cost_life": cost_life,
                            "cost_actions": cost_actions,
                            "element": self._element_summary(hex_state, state=state),
                        }
                    )

        if hex_state.get("building_upgrade"):
            return actions
        building = self.config.buildings.get(str(hex_state.get("building") or ""))
        for upgrade_id in building.get("upgrade_ids", []) if building else []:
            upgrade = self.config.upgrades.get(upgrade_id)
            if not upgrade:
                continue
            cost_actions = int(upgrade.get("cost_actions") or 1)
            cost_life = int(upgrade.get("cost_life") or 0)
            maturity_min = int((upgrade.get("requires") or {}).get("maturity_min") or 0)
            if actions_left >= cost_actions and available_life >= cost_life and int(state.get("maturity") or 0) >= maturity_min:
                actions.append(
                    {
                        "type": "upgrade",
                        "upgrade_id": upgrade_id,
                        "label": upgrade["label"],
                        "cost_life": cost_life,
                        "cost_actions": cost_actions,
                        "requires": upgrade.get("requires") or {},
                        "element": self._element_summary({**hex_state, "building_upgrade": upgrade_id}),
                    }
                )
        return actions

    def calculate_economy(self, grid: dict[str, dict[str, Any]], *, state: dict[str, Any] | None = None) -> dict[str, int]:
        state_view = state or {"grid": grid, "global_upgrades": {}}
        connected_keys = self._connected_building_keys(state_view)
        prod = 0
        sustain = 0
        for key, hex_state in grid.items():
            building_id = hex_state.get("building")
            if not building_id:
                continue
            if not self._is_building_active(hex_state, key, connected_keys, self._global_upgrades(state_view)):
                continue
            building = self.config.buildings.get(str(building_id), {})
            sustain += self._sustain_cost_for_tile(hex_state, building)
            prod += self._production_for_tile(hex_state).get("life", 0)
        return {"prod": prod, "sustain": sustain}

    def _apply_build(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        tile_key = str(command.get("tile_key") or "")
        building_type = str(command.get("building_type") or "")
        building = self.config.buildings[building_type]
        tile = state["grid"][tile_key]
        tile.update({"building": building_type, "building_upgrade": None, "stress": 0, "extraction_progress": 0})
        state["actions_left"] = int(state["actions_left"]) - int(building.get("build_cost_actions") or 1)
        state["spent_life"] = int(state.get("spent_life") or 0) + int(building.get("build_cost_life") or 0)
        nutrient = f" {str(tile.get('nutrient_type')).title()}" if building_type == "assimilator" and tile.get("nutrient_type") else ""
        self._add_log(state, f"Built{nutrient} {building['label']} at {tile['q']},{tile['r']}.")

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

    def _apply_global_upgrade(self, state: dict[str, Any], command: dict[str, Any]) -> None:
        upgrade_id = str(command.get("upgrade_id") or "")
        upgrade = self.config.global_upgrades[upgrade_id]
        global_upgrades = self._global_upgrades(state)
        global_upgrades[upgrade_id] = True
        state["global_upgrades"] = global_upgrades
        state["actions_left"] = int(state["actions_left"]) - int(upgrade.get("cost_actions") or 1)
        state["spent_life"] = int(state.get("spent_life") or 0) + int(upgrade.get("cost_life") or 0)
        self._add_log(state, f"Unlocked {upgrade['label']}.")

    def _apply_dismantle(self, state: dict[str, Any], command: dict[str, Any], *, compost: bool) -> None:
        tile = state["grid"][str(command.get("tile_key") or "")]
        building_id = str(tile.get("building") or "")
        building = self.config.buildings.get(building_id, {"label": building_id})
        tile.update({"building": None, "building_upgrade": None, "stress": 0, "extraction_progress": 0})
        state["actions_left"] = int(state["actions_left"]) - 1
        if compost:
            self._apply_compost_hydration(state, tile)
            self._add_log(state, f"Composted {building['label']} at {tile['q']},{tile['r']}.")
        else:
            self._add_log(state, f"Dismantled {building['label']} at {tile['q']},{tile['r']}.")

    def _apply_compost_hydration(self, state: dict[str, Any], tile: dict[str, Any]) -> None:
        tile["hydration"] = self._clamp_hydration(int(tile["hydration"]) + 1, tile.get("terrain"))
        candidates = []
        for neighbor in neighbors(tile["q"], tile["r"]):
            target = state["grid"].get(hex_key(neighbor["q"], neighbor["r"]))
            if target:
                candidates.append((int(target.get("hydration") or 0), neighbor["dir_index"], target))
        candidates.sort(key=lambda item: (item[0], _angular_distance(item[1], int(state.get("wind_dir") or 0))))
        for _, _, target in candidates[:2]:
            target["hydration"] = self._clamp_hydration(int(target["hydration"]) + 1, target.get("terrain"))

    def _apply_end_season(self, state: dict[str, Any]) -> None:
        rng = self._rng_for(state, "end_season")
        turn_logs: list[str] = []
        season = int(state["season"])
        if season > 1 and season % 2 != 0:
            state["wind_dir"] = rng.randrange(0, len(DIRECTIONS))
            turn_logs.append(f"Wind shifted to {DIRECTIONS[state['wind_dir']]['name']}.")

        connected_keys = self._connected_building_keys(state)
        global_upgrades = self._global_upgrades(state)
        self._resolve_condensers(state, rng, connected_keys, global_upgrades)
        if season % 2 == 0:
            self._resolve_drought(state, rng)
            turn_logs.append("Drought replicated.")

        projected_economy = self.calculate_economy(state["grid"], state=state)
        if projected_economy["sustain"] > projected_economy["prod"]:
            deficit = projected_economy["sustain"] - projected_economy["prod"]
            turn_logs.append(f"Deficit of {deficit} Life. Structures strained.")
            active_buildings = [
                tile for key, tile in state["grid"].items()
                if tile.get("building")
                and tile.get("building") != "core"
                and self._is_building_active(tile, key, connected_keys, global_upgrades)
            ]
            for _ in range(deficit):
                if active_buildings:
                    rng.choice(active_buildings)["stress"] += 1

        self._resolve_assimilators(state, rng, connected_keys, global_upgrades, turn_logs)
        core_died = self._resolve_stress_and_maturity(state, connected_keys, global_upgrades, turn_logs)
        state["season"] = season + 1
        state["actions_left"] = int(self.rules["actions_per_season"])
        state["spent_life"] = 0
        state["base_economy"] = self.calculate_economy(state["grid"], state=state)
        for message in reversed(turn_logs):
            self._add_log(state, message)

        goals = self._goals(state)
        if core_died:
            state["game_over"] = "lose"
            state["phase"] = "FINISHED"
        elif int(state["maturity"]) >= int(goals["target_maturity"]):
            state["game_over"] = "win"
            state["phase"] = "FINISHED"
        elif season >= int(goals["survive_phases"]):
            state["game_over"] = "win" if str(goals.get("mode") or "all") in {"survive", "any"} else "lose"
            state["phase"] = "FINISHED"

    def _resolve_condensers(
        self,
        state: dict[str, Any],
        rng: random.Random,
        connected_keys: set[str] | None = None,
        global_upgrades: dict[str, bool] | None = None,
    ) -> None:
        connected_keys = connected_keys if connected_keys is not None else self._connected_building_keys(state)
        global_upgrades = global_upgrades or self._global_upgrades(state)
        for key, tile in list(state["grid"].items()):
            if tile.get("building") != "condenser":
                continue
            if not self._is_building_active(tile, key, connected_keys, global_upgrades):
                continue
            for effect in self._active_effects(tile):
                if effect.get("type") != "hydration_push":
                    continue
                specs = effect.get("specs") or {}
                if not self._conditions_match(tile, specs.get("conditions") or {}):
                    continue
                if str(specs.get("target") or "least_hydrated_adjacent") != "least_hydrated_adjacent":
                    continue
                iterations = int(specs.get("iterations") or 1)
                value = int(specs.get("value") or 1)
                for _ in range(iterations):
                    self._push_hydration_to_least_hydrated_neighbor(state, tile, value, rng)

    def _push_hydration_to_least_hydrated_neighbor(
        self,
        state: dict[str, Any],
        tile: dict[str, Any],
        value: int,
        rng: random.Random,
    ) -> None:
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
            target["hydration"] = self._clamp_hydration(int(target["hydration"]) + value, target.get("terrain"))

    def _resolve_drought(self, state: dict[str, Any], rng: random.Random) -> None:
        drought_level = int(self.rules["hydration_min"])
        sources = [copy.copy(tile) for tile in state["grid"].values() if int(tile.get("hydration") or 0) <= drought_level]
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

    def _resolve_assimilators(
        self,
        state: dict[str, Any],
        rng: random.Random,
        connected_keys: set[str],
        global_upgrades: dict[str, bool],
        turn_logs: list[str],
    ) -> None:
        produced: list[str] = []
        for key, tile in state["grid"].items():
            if tile.get("building") != "assimilator":
                continue
            if not self._is_building_active(tile, key, connected_keys, global_upgrades):
                continue
            nutrient_type = str(tile.get("nutrient_type") or "")
            if nutrient_type not in NUTRIENT_TYPES:
                continue
            projection = self._assimilator_projection(state, tile)
            if int(tile.get("hydration") or 0) <= int(projection["stress_hydration_max"]):
                tile["stress"] = int(tile.get("stress") or 0) + int(projection["stress_value"])
            rate = int(projection["rate"])
            if rate <= 0:
                continue
            progress = int(tile.get("extraction_progress") or 0) + rate
            threshold = int(projection["threshold"])
            created = progress // threshold
            tile["extraction_progress"] = progress % threshold
            if created:
                strains = self._strain_counts(state)
                strains[nutrient_type] = int(strains.get(nutrient_type) or 0) + created
                state["strains"] = strains
                produced.extend([nutrient_type] * created)
        if produced:
            labels = [nutrient.title() for nutrient in produced]
            turn_logs.append(f"{len(produced)} Strain{'s' if len(produced) != 1 else ''} produced this season: {' + '.join(labels)}.")

    def _assimilator_projection(self, state: dict[str, Any], tile: dict[str, Any]) -> dict[str, int]:
        effect = next((item for item in self._active_effects(tile) if item.get("type") == "strain_extraction"), {})
        specs = effect.get("specs") or {}
        open_neighbors = sum(
            1
            for neighbor in neighbors(tile["q"], tile["r"])
            if not state["grid"].get(hex_key(neighbor["q"], neighbor["r"]), {}).get("building")
        )
        openness = specs.get("open_neighbors") or {}
        high_min = int(openness.get("high_min") or 4)
        medium_min = int(openness.get("medium_min") or 2)
        if open_neighbors >= high_min:
            openness_rate = int(openness.get("high_value") or 2)
        elif open_neighbors >= medium_min:
            openness_rate = int(openness.get("medium_value") or 1)
        else:
            openness_rate = 0
        dry_penalty_hydration_max = int(specs.get("dry_penalty_hydration_max") or -1)
        dry_penalty = int(specs.get("dry_penalty") or 1) if int(tile.get("hydration") or 0) <= dry_penalty_hydration_max else 0
        return {
            "open_neighbors": open_neighbors,
            "openness_rate": openness_rate,
            "dry_penalty": dry_penalty,
            "rate": max(0, openness_rate - dry_penalty),
            "threshold": int(specs.get("threshold") or self.rules["strain_threshold"]),
            "stress_hydration_max": int(specs.get("stress_hydration_max") or -2),
            "stress_value": int(specs.get("stress_value") or 1),
        }

    def _resolve_stress_and_maturity(
        self,
        state: dict[str, Any],
        connected_keys: set[str],
        global_upgrades: dict[str, bool],
        turn_logs: list[str],
    ) -> bool:
        core_died = False
        for key, tile in state["grid"].items():
            if tile.get("terrain") == "forest":
                forest = self.config.terrains["forest"]
                if int(tile["hydration"]) <= int(forest["wither_hydration_max"]):
                    tile["terrain_stress"] = int(tile.get("terrain_stress") or 0) + 1
                if int(tile.get("terrain_stress") or 0) >= int(forest["wither_stress_threshold"]):
                    tile["terrain"] = "neutral"
                    tile["terrain_stress"] = 0
                    turn_logs.append(f"Forest at {tile['q']},{tile['r']} withered.")

            building_id = tile.get("building")
            if not building_id:
                continue
            building = self.config.buildings[str(building_id)]
            active = self._is_building_active(tile, key, connected_keys, global_upgrades)
            stress_added = self._stress_for_tile(tile) if active else 0
            if stress_added:
                tile["stress"] = int(tile.get("stress") or 0) + stress_added
            if int(tile.get("stress") or 0) >= int(self.rules["stress_collapse_threshold"]):
                if building_id == "core":
                    core_died = True
                turn_logs.append(f"{building['label']} at {tile['q']},{tile['r']} collapsed.")
                tile.update({"building": None, "building_upgrade": None, "stress": 0, "extraction_progress": 0})
                continue
            if active:
                state["maturity"] = int(state.get("maturity") or 0) + self._production_for_tile(tile).get("maturity", 0)
        strain_maturity = self._strain_maturity(self._strain_counts(state))
        if strain_maturity:
            state["maturity"] = int(state.get("maturity") or 0) + strain_maturity
            turn_logs.append(f"Strains generated {strain_maturity} Maturity.")
        return core_died

    def _can_build_on(self, state: dict[str, Any], tile: dict[str, Any], building: dict[str, Any]) -> bool:
        if tile.get("building") is not None:
            return False
        if building.get("requires_terrain") and tile.get("terrain") != building["requires_terrain"]:
            return False
        if building.get("requires_hydration_min") is not None and int(tile.get("hydration") or 0) < int(building["requires_hydration_min"]):
            return False
        if building.get("requires_nutrient") and not tile.get("nutrient_type"):
            return False
        if building.get("requires_adjacent_colony"):
            connected_keys = self._connected_building_keys(state)
            global_upgrades = self._global_upgrades(state)
            return any(
                self._is_building_active(
                    state["grid"].get(hex_key(neighbor["q"], neighbor["r"]), {}),
                    hex_key(neighbor["q"], neighbor["r"]),
                    connected_keys,
                    global_upgrades,
                )
                for neighbor in neighbors(tile["q"], tile["r"])
            )
        return True

    def _available_life(self, state: dict[str, Any]) -> int:
        base = state.get("base_economy") or {"prod": 0, "sustain": 0}
        return max(0, int(base["prod"]) - int(base["sustain"])) - int(state.get("spent_life") or 0)

    def _resource_summary(self, state: dict[str, Any], *, live_economy: dict[str, int]) -> dict[str, Any]:
        base = state.get("base_economy") or {"prod": 0, "sustain": 0}
        spent_life = int(state.get("spent_life") or 0)
        return {
            "life": {
                "produced": int(base.get("prod") or 0),
                "allocated": int(base.get("sustain") or 0),
                "available": max(0, int(base.get("prod") or 0) - int(base.get("sustain") or 0)) - spent_life,
                "next_produced": int(live_economy.get("prod") or 0),
                "next_allocated": int(live_economy.get("sustain") or 0),
            },
            "maturity": {
                "value": int(state.get("maturity") or 0),
                "target": int(self.rules["target_maturity"]),
            },
        }

    def _element_summary(
        self,
        tile: dict[str, Any] | None,
        *,
        state: dict[str, Any] | None = None,
        connected_keys: set[str] | None = None,
    ) -> dict[str, Any] | None:
        if not tile:
            return None
        building_id = tile.get("building")
        if building_id:
            building = self.config.buildings.get(str(building_id), {})
            active = True
            extraction = None
            if state is not None:
                key = hex_key(int(tile.get("q") or 0), int(tile.get("r") or 0))
                connected = connected_keys if connected_keys is not None else self._connected_building_keys(state)
                active = self._is_building_active(tile, key, connected, self._global_upgrades(state))
                if building_id == "assimilator":
                    projection = self._assimilator_projection(state, tile)
                    extraction = {
                        "progress": int(tile.get("extraction_progress") or 0),
                        "threshold": int(projection["threshold"]),
                        "projected_rate": int(projection["rate"]) if active else 0,
                        "open_neighbors": int(projection["open_neighbors"]),
                        "openness_rate": int(projection["openness_rate"]),
                        "dry_penalty": int(projection["dry_penalty"]),
                    }
            return {
                "kind": "building",
                "id": building_id,
                "label": building.get("label", building_id),
                "color": building.get("color", "#94a3b8"),
                "tags": building.get("tags", []),
                "active": active,
                "nutrient_type": tile.get("nutrient_type"),
                "extraction": extraction,
                "sustain_cost": self._sustain_cost_for_tile(tile, building),
                "effects": self._active_effects(tile),
                "current_production": self._production_for_tile(tile) if active else {},
                "current_stress": self._stress_for_tile(tile) if active else 0,
            }
        terrain_id = tile.get("terrain")
        terrain = self.config.terrains.get(str(terrain_id or ""), {})
        if terrain_id and terrain_id != "neutral":
            return {
                "kind": "terrain",
                "id": terrain_id,
                "label": terrain.get("label", terrain_id),
                "color": terrain.get("color", "#718096"),
                "tags": [],
                "effects": [],
                "current_production": {},
                "current_stress": int(tile.get("terrain_stress") or 0),
            }
        return None

    def _production_for_tile(self, tile: dict[str, Any]) -> dict[str, int]:
        totals: dict[str, int] = {}
        for effect in self._active_effects(tile):
            if effect.get("type") != "production":
                continue
            specs = effect.get("specs") or {}
            if not self._conditions_match(tile, specs.get("conditions") or {}):
                continue
            resource = str(specs.get("resource") or "life")
            totals[resource] = totals.get(resource, 0) + int(specs.get("value") or 0)
        return {resource: max(0, value) for resource, value in totals.items()}

    def _stress_for_tile(self, tile: dict[str, Any]) -> int:
        total = 0
        for effect in self._active_effects(tile):
            if effect.get("type") != "stress":
                continue
            specs = effect.get("specs") or {}
            if self._conditions_match(tile, specs.get("conditions") or {}):
                total += int(specs.get("value") or 0)
        return total

    def _active_effects(self, tile: dict[str, Any]) -> list[dict[str, Any]]:
        building = self.config.buildings.get(str(tile.get("building") or ""), {})
        effects = [copy.deepcopy(effect) for effect in building.get("effects", [])]
        upgrade = self.config.upgrades.get(str(tile.get("building_upgrade") or ""), {})
        replacements = {
            str(item.get("replace_id")): copy.deepcopy(item.get("effect") or {})
            for item in upgrade.get("effect_replacements", [])
            if item.get("replace_id") and item.get("effect")
        }
        if replacements:
            effects = [replacements.get(str(effect.get("id")), effect) for effect in effects]
        effects.extend(copy.deepcopy(effect) for effect in upgrade.get("effect_additions", []))
        return effects

    def _sustain_cost_for_tile(self, tile: dict[str, Any], building: dict[str, Any]) -> int:
        upgrade = self.config.upgrades.get(str(tile.get("building_upgrade") or ""), {})
        return max(0, int(building.get("sustain_cost") or 0) + int(upgrade.get("sustain_delta") or 0))

    def _conditions_match(self, tile: dict[str, Any], conditions: dict[str, Any]) -> bool:
        for condition_id, allowed_values in conditions.items():
            if not isinstance(allowed_values, list):
                allowed_values = [allowed_values]
            if self._condition_value(tile, str(condition_id)) not in allowed_values:
                return False
        return True

    @staticmethod
    def _condition_value(tile: dict[str, Any], condition_id: str) -> Any:
        if condition_id == "hydration":
            return int(tile.get("hydration") or 0)
        if condition_id == "stress":
            return int(tile.get("stress") or 0)
        if condition_id == "terrain":
            return tile.get("terrain")
        if condition_id == "building":
            return tile.get("building")
        return tile.get(condition_id)

    def _connected_building_keys(self, state: dict[str, Any]) -> set[str]:
        grid = state.get("grid") or {}
        core_key = hex_key(int(self.rules["core_start_q"]), int(self.rules["core_start_r"]))
        connected: set[str] = set()
        queue = [core_key]
        while queue:
            key = queue.pop(0)
            if key in connected:
                continue
            tile = grid.get(key)
            if not tile or not tile.get("building"):
                continue
            connected.add(key)
            for neighbor in neighbors(tile["q"], tile["r"]):
                neighbor_key = hex_key(neighbor["q"], neighbor["r"])
                if neighbor_key not in connected and grid.get(neighbor_key, {}).get("building"):
                    queue.append(neighbor_key)
        return connected

    def _is_building_active(
        self,
        tile: dict[str, Any],
        key: str,
        connected_keys: set[str],
        global_upgrades: dict[str, bool],
    ) -> bool:
        building_id = str(tile.get("building") or "")
        if not building_id:
            return False
        if key in connected_keys:
            return True
        autonomous_map = {
            "assimilator": "autonomous_assimilators",
            "connector": "autonomous_connectors",
            "condenser": "autonomous_condensers",
            "bloom": "autonomous_blooms",
        }
        upgrade_id = autonomous_map.get(building_id)
        return bool(upgrade_id and global_upgrades.get(upgrade_id))

    def _global_upgrades(self, state: dict[str, Any]) -> dict[str, bool]:
        values = {
            "composting": False,
            "autonomous_assimilators": False,
            "autonomous_connectors": False,
            "autonomous_condensers": False,
            "autonomous_blooms": False,
        }
        values.update({str(key): bool(value) for key, value in (state.get("global_upgrades") or {}).items()})
        return values

    def _strain_counts(self, state: dict[str, Any]) -> dict[str, int]:
        source = state.get("strains") or {}
        return {nutrient_type: int(source.get(nutrient_type) or 0) for nutrient_type in NUTRIENT_TYPES}

    def _strain_maturity(self, strains: dict[str, int]) -> int:
        triplets = min(int(strains.get("green") or 0), int(strains.get("blue") or 0), int(strains.get("purple") or 0))
        quadratic = sum(int(strains.get(nutrient_type) or 0) ** 2 for nutrient_type in NUTRIENT_TYPES)
        return quadratic + triplets * int(self.rules["strain_triplet_maturity_bonus"])

    def _goals(self, state: dict[str, Any]) -> dict[str, Any]:
        source = state.get("goals") or {}
        return {
            "mode": str(source.get("mode") or "all"),
            "survive_phases": int(source.get("survive_phases") or self.rules["max_seasons"]),
            "target_maturity": int(source.get("target_maturity") or self.rules["target_maturity"]),
        }

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
