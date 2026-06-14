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
            tile.update({"terrain": "neutral", "hydration": 0, "building": None, "building_upgrade": None})
        state["grid"]["0,0"].update({"building": "condenser", "hydration": 0})
        state["grid"]["1,0"]["hydration"] = -3
        state["grid"]["0,1"]["hydration"] = -2

        public_state = engine.public_state(state, selected_tile="0,0")
        effects = public_state["selected_element"]["effects"]
        self.assertTrue(any(effect["type"] == "hydration_push" for effect in effects))

        engine._resolve_condensers(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], -2)

        state["grid"]["0,0"]["building_upgrade"] = "condenser_heavy"
        state["grid"]["1,0"]["hydration"] = -3
        state["grid"]["0,1"]["hydration"] = -2
        heavy_effects = engine._active_effects(state["grid"]["0,0"])
        hydration_effect = next(effect for effect in heavy_effects if effect["type"] == "hydration_push")
        self.assertEqual(hydration_effect["specs"]["iterations"], 2)

        engine._resolve_condensers(state, engine._rng_for(state, "test"))
        self.assertEqual(state["grid"]["1,0"]["hydration"], -1)

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
