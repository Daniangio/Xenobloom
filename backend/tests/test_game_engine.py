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
