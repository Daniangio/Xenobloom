import unittest

from backend.app.game_engine import GameEngine


class TestGameEngine(unittest.TestCase):
    def test_initial_state_exposes_config_driven_build_action(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)

        actions = engine.available_actions(state, selected_tile="1,0")

        self.assertEqual(state["grid"]["0,0"]["building"], "core")
        self.assertTrue(any(action["type"] == "build" and action["building_type"] == "bloom" for action in actions))
        self.assertTrue(any(action["type"] == "build" and action["building_type"] == "condenser" for action in actions))
        self.assertTrue(any(action["type"] == "build" and action["building_type"] == "connector" for action in actions))

    def test_build_command_advances_revision_independent_of_frontend(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        command = {
            "command_id": "cmd_1",
            "type": "build",
            "tile_key": "1,0",
            "building_type": "bloom",
            "expected_revision": 0,
            "client_timestamp_ms": 1000,
        }

        engine.validate_command(state, command)
        next_state = engine.apply_command(state, command)

        self.assertEqual(next_state["revision"], 1)
        self.assertEqual(next_state["grid"]["1,0"]["building"], "bloom")
        self.assertEqual(next_state["actions_left"], 2)
        self.assertEqual(next_state["spent_life"], 1)

    def test_effects_drive_production_stress_and_public_element_metadata(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        tile = state["grid"]["1,0"]
        tile.update({"building": "bloom", "hydration": 3, "stress": 0})

        public_state = engine.public_state(state, selected_tile="1,0")

        self.assertEqual(engine.calculate_economy(state["grid"])["prod"], 5)
        self.assertEqual(public_state["selected_element"]["current_production"]["life"], 2)
        self.assertEqual(public_state["selected_element"]["current_production"]["maturity"], 1)
        self.assertIn("Organic", public_state["selected_element"]["tags"])

        tile["hydration"] = -1
        self.assertEqual(public_state["config"]["buildings"]["bloom"]["effects"][0]["type"], "production")
        self.assertEqual(engine._stress_for_tile(tile), 1)

    def test_connector_costs_no_life_and_stresses_when_dry(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        command = {
            "command_id": "cmd_connector",
            "type": "build",
            "tile_key": "1,0",
            "building_type": "connector",
            "expected_revision": 0,
            "client_timestamp_ms": 1000,
        }

        engine.validate_command(state, command)
        next_state = engine.apply_command(state, command)
        next_state["grid"]["1,0"]["hydration"] = -1

        self.assertEqual(next_state["spent_life"], 0)
        self.assertEqual(engine._stress_for_tile(next_state["grid"]["1,0"]), 1)

    def test_condenser_hydration_push_is_configured_as_effect(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 3, "building": None, "building_upgrade": None})
        state["grid"]["0,0"].update({"building": "condenser", "hydration": 0})
        state["grid"]["1,0"]["hydration"] = -3
        state["grid"]["0,1"]["hydration"] = 0

        public_state = engine.public_state(state, selected_tile="0,0")
        effects = public_state["selected_element"]["effects"]
        self.assertTrue(any(effect["type"] == "hydration_push" for effect in effects))

        engine._resolve_condensers(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], -2)

        state["grid"]["0,0"]["building_upgrade"] = "condenser_heavy"
        state["grid"]["1,0"]["hydration"] = -3
        state["grid"]["0,1"]["hydration"] = 0
        heavy_effects = engine._active_effects(state["grid"]["0,0"])
        hydration_effect = next(effect for effect in heavy_effects if effect["type"] == "hydration_push")
        self.assertEqual(hydration_effect["specs"]["iterations"], 2)

        engine._resolve_condensers(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], -1)

    def test_nutrients_assimilators_and_strain_scoring(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        nutrient_counts = {"green": 0, "blue": 0, "purple": 0}
        for tile in state["grid"].values():
            if tile.get("nutrient_type"):
                nutrient_counts[tile["nutrient_type"]] += 1
        self.assertEqual(nutrient_counts, {"green": 3, "blue": 3, "purple": 3})

        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None, "nutrient_type": None, "extraction_progress": 0})
        state["grid"]["0,0"]["building"] = "core"
        state["grid"]["1,0"].update({"nutrient_type": "green", "building": "assimilator", "hydration": 0, "extraction_progress": 4})

        engine._resolve_assimilators(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )

        self.assertEqual(state["strains"]["green"], 1)
        self.assertEqual(state["grid"]["1,0"]["extraction_progress"], 1)
        self.assertEqual(engine._strain_maturity(state["strains"]), 1)

    def test_assimilator_uses_progressive_strain_thresholds(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None, "nutrient_type": None, "extraction_progress": 0})
        state["grid"]["0,0"]["building"] = "core"
        state["grid"]["1,0"].update({"nutrient_type": "green", "building": "assimilator", "hydration": 0, "extraction_progress": 5})
        state["strains"]["green"] = 1

        projection = engine._assimilator_projection(state, state["grid"]["1,0"])
        self.assertEqual(projection["threshold"], 6)
        self.assertEqual(projection["thresholds"], [5, 6, 8, 10])

        engine._resolve_assimilators(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )

        self.assertEqual(state["strains"]["green"], 2)
        self.assertEqual(state["grid"]["1,0"]["extraction_progress"], 1)
        self.assertEqual(engine._assimilator_projection(state, state["grid"]["1,0"])["threshold"], 8)

    def test_assimilator_reuses_last_threshold_for_later_strains(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None, "nutrient_type": None, "extraction_progress": 0})
        state["grid"]["0,0"]["building"] = "core"
        state["grid"]["1,0"].update({"nutrient_type": "green", "building": "assimilator", "hydration": 0, "extraction_progress": 9})
        state["strains"]["green"] = 4

        projection = engine._assimilator_projection(state, state["grid"]["1,0"])
        self.assertEqual(projection["threshold"], 10)

        engine._resolve_assimilators(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )

        self.assertEqual(state["strains"]["green"], 5)
        self.assertEqual(state["grid"]["1,0"]["extraction_progress"], 1)

    def test_disconnected_buildings_are_inactive_until_global_upgrade(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None, "nutrient_type": None, "extraction_progress": 0})
        state["grid"]["0,0"]["building"] = "core"
        state["grid"]["3,0"].update({"building": "assimilator", "nutrient_type": "blue", "extraction_progress": 4})

        self.assertEqual(engine.calculate_economy(state["grid"], state=state)["sustain"], 0)
        engine._resolve_assimilators(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )
        self.assertEqual(state["strains"]["blue"], 0)

        state["global_upgrades"]["autonomous_assimilators"] = True
        self.assertEqual(engine.calculate_economy(state["grid"], state=state)["sustain"], 1)
        engine._resolve_assimilators(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )
        self.assertEqual(state["strains"]["blue"], 1)

    def test_only_fully_dry_tiles_spread_drought(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0})

        state["grid"]["0,0"]["hydration"] = -2
        state["grid"]["1,0"]["hydration"] = 2
        engine._resolve_drought(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], 2)

        state["grid"]["0,0"]["hydration"] = -3
        engine._resolve_drought(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], 1)

    def test_scheduled_wind_is_forecast_and_used_next_season(self):
        engine = GameEngine()
        state = engine.create_initial_state(
            seed=42,
            creation={
                "wind": {
                    "mode": "scheduled",
                    "schedule": [
                        {"season": 1, "direction": "E"},
                        {"season": 2, "direction": "W"},
                    ],
                }
            },
        )

        public_state = engine.public_state(state)
        self.assertEqual(public_state["wind_label"], "E")
        next_state = engine.apply_command(state, {"type": "end_season"})

        self.assertEqual(next_state["wind_dir"], 0)
        self.assertEqual(engine.public_state(next_state)["wind_label"], "W")

    def test_sudden_drought_event_triggers_and_is_publicly_forecast(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        state["events"] = [
            {"id": "dry_2", "type": "sudden_drought", "season": 1, "severity": 1, "revealed": True}
        ]
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0})

        public_state = engine.public_state(state)
        self.assertEqual(public_state["events"][0]["seasons_until"], 0)
        next_state = engine.apply_command(state, {"type": "end_season"})

        dry_tiles = [
            tile for tile in next_state["grid"].values()
            if int(tile.get("hydration") or 0) == -3 and tile.get("building") != "core"
        ]
        self.assertGreaterEqual(len(dry_tiles), 2)
        self.assertTrue(next_state["events"][0]["resolved"])

    def test_hazard_alarm_is_public_only_three_seasons_ahead(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        state["events"] = [
            {"id": "dry_5", "type": "sudden_drought", "season": 5, "severity": 3, "revealed": True}
        ]

        self.assertEqual(engine.public_state(state)["events"], [])
        state["season"] = 2

        public_state = engine.public_state(state)
        self.assertEqual(public_state["events"][0]["seasons_until"], 3)
        self.assertEqual(public_state["events"][0]["severity"], 3)

    def test_aquifer_collects_excess_and_releases_to_dry_tiles(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None})
        state["grid"]["0,0"].update({"building": "core", "hydration": 0})
        state["grid"]["1,0"].update({"building": "aquifer", "hydration": 3})
        state["grid"]["2,0"]["hydration"] = -3
        state["grid"]["1,-1"]["hydration"] = 3

        engine._resolve_aquifers(
            state,
            engine._rng_for(state, "test"),
            engine._connected_building_keys(state),
            engine._global_upgrades(state),
            [],
        )

        self.assertLessEqual(state["grid"]["1,0"]["hydration"], 1)
        self.assertLessEqual(state["grid"]["1,-1"]["hydration"], 1)
        self.assertGreater(state["grid"]["2,0"]["hydration"], -3)
        self.assertGreaterEqual(state["aquifer_pool"], 0)

    def test_flood_aquifer_can_release_above_safe_moisture(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        for tile in state["grid"].values():
            tile.update({"terrain": "neutral", "hydration": 3, "building": None, "building_upgrade": None})
        state["grid"]["0,0"].update({"building": "core"})
        state["grid"]["1,0"].update({"building": "aquifer", "building_upgrade": "aquifer_flood", "hydration": 3})
        state["grid"]["2,0"]["hydration"] = 1
        state["aquifer_pool"] = 2

        released = engine._release_aquifer_pool(
            state,
            engine._active_aquifer_nodes(state, engine._connected_building_keys(state), engine._global_upgrades(state)),
            engine._rng_for(state, "test"),
        )

        self.assertEqual(released, 2)
        self.assertEqual(state["grid"]["2,0"]["hydration"], 3)

    def test_expanded_aquifer_network_global_upgrade_increases_pool_max(self):
        engine = GameEngine()
        state = engine.create_initial_state(seed=42)
        state["base_economy"] = {"prod": 10, "sustain": 0}
        command = {
            "command_id": "cmd_expanded_aquifer",
            "type": "global_upgrade",
            "tile_key": "0,0",
            "upgrade_id": "expanded_aquifer_network",
            "expected_revision": 0,
            "client_timestamp_ms": 1000,
        }

        actions = engine.available_actions(state, selected_tile="0,0")
        self.assertTrue(
            any(
                action["type"] == "global_upgrade"
                and action["upgrade_id"] == "expanded_aquifer_network"
                for action in actions
            )
        )

        engine.validate_command(state, command)
        next_state = engine.apply_command(state, command)

        self.assertTrue(next_state["global_upgrades"]["expanded_aquifer_network"])
        self.assertEqual(next_state["aquifer_pool_max"], 10)
        self.assertEqual(engine.public_state(next_state)["aquifer"]["max"], 10)
