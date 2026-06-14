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
