import unittest

from backend.app.creation_service import CreationService
from backend.app.game_room_service import GameRoomService
from backend.app.server_models import User


class TestCreationService(unittest.IsolatedAsyncioTestCase):
    async def test_creation_lifecycle_and_sparse_payload(self):
        service = CreationService()
        user = User(id="creator", username="Creator")

        creation = await service.create_creation(
            user=user,
            name="Dry Valley",
            payload={
                "tiles": {
                    "2,0": {"terrain": "forest", "hydration": 1, "nutrient_type": "green"},
                    "0,0": {"building": "core"},
                },
                "goals": {"mode": "all", "survive_phases": 12, "target_maturity": 250},
            },
        )

        self.assertEqual(creation["status"], "draft")
        self.assertEqual(creation["payload"]["tiles"]["2,0"]["nutrient_type"], "green")
        self.assertNotIn("3,0", creation["payload"]["tiles"])

        published = await service.update_creation(
            creation_id=creation["id"],
            user=user,
            publish=True,
        )
        self.assertEqual(published["status"], "published")
        self.assertEqual([item["id"] for item in await service.list_published_creations()], [creation["id"]])

    async def test_grid_only_records_are_not_persisted_but_normal_tiles_are(self):
        service = CreationService()
        user = User(id="creator", username="Creator")

        creation = await service.create_creation(
            user=user,
            name="Sparse",
            payload={
                "tiles": {
                    "1,0": {"terrain": "neutral", "hydration": 0, "building": None},
                    "1,1": {"hydration": 0, "building": None},
                    "2,0": {"terrain": "neutral", "hydration": 1},
                }
            },
        )

        self.assertEqual(creation["payload"]["tiles"]["1,0"]["terrain"], "neutral")
        self.assertNotIn("1,1", creation["payload"]["tiles"])
        self.assertEqual(creation["payload"]["tiles"]["2,0"]["hydration"], 1)

    async def test_game_room_can_start_from_creation_payload(self):
        creation_service = CreationService()
        room_service = GameRoomService()
        user = User(id="creator", username="Creator")
        creation = await creation_service.create_creation(
            user=user,
            name="Blue Run",
            payload={
                "tiles": {
                    "0,0": {"building": "core"},
                    "1,0": {"nutrient_type": "blue", "building": "assimilator"},
                },
                "goals": {"mode": "all", "survive_phases": 8, "target_maturity": 50},
            },
        )
        creation = await creation_service.update_creation(creation_id=creation["id"], user=user, publish=True)

        room = await room_service.create_room(user=user, game_type="creation", creation=creation)
        state = await room_service.get_game_state(room_id=room["id"], user=user, selected_tile="1,0")

        self.assertEqual(state["selected_tile"]["nutrient_type"], "blue")
        self.assertEqual(state["selected_tile"]["building"], "assimilator")
        self.assertEqual(set(state["grid"].keys()), {"0,0", "1,0"})
        self.assertEqual(state["max_seasons"], 8)
        self.assertEqual(state["target_maturity"], 50)

    async def test_creation_core_position_anchors_build_actions(self):
        creation_service = CreationService()
        room_service = GameRoomService()
        user = User(id="creator", username="Creator")
        creation = await creation_service.create_creation(
            user=user,
            name="Offset Core",
            payload={
                "tiles": {
                    "3,0": {"terrain": "neutral", "building": "core"},
                    "4,0": {"terrain": "neutral", "hydration": 1},
                },
            },
        )
        creation = await creation_service.update_creation(creation_id=creation["id"], user=user, publish=True)

        room = await room_service.create_room(user=user, game_type="creation", creation=creation)
        state = await room_service.get_game_state(room_id=room["id"], user=user, selected_tile="4,0")

        self.assertEqual(state["grid"]["3,0"]["building"], "core")
        self.assertTrue(
            any(action["type"] == "build" and action["building_type"] == "bloom" for action in state["available_actions"])
        )

    async def test_creation_hazards_are_loaded_and_resolved_in_game_room(self):
        creation_service = CreationService()
        room_service = GameRoomService()
        user = User(id="creator", username="Creator")
        creation = await creation_service.create_creation(
            user=user,
            name="Hazard Run",
            payload={
                "tiles": {
                    "0,0": {"terrain": "neutral", "building": "core"},
                    "2,0": {"terrain": "neutral", "hydration": 0},
                    "3,0": {"terrain": "neutral", "hydration": 0},
                    "0,2": {"terrain": "neutral", "hydration": 0},
                },
                "events": [
                    {"id": "creator_drought", "type": "sudden_drought", "season": 1, "severity": 1, "revealed": True}
                ],
            },
        )
        creation = await creation_service.update_creation(creation_id=creation["id"], user=user, publish=True)

        room = await room_service.create_room(user=user, game_type="creation", creation=creation)
        state = await room_service.get_game_state(room_id=room["id"], user=user)
        self.assertEqual(state["events"][0]["id"], "creator_drought")
        self.assertEqual(state["events"][0]["seasons_until"], 0)

        await room_service.enqueue_game_command(
            room_id=room["id"],
            user=user,
            command={
                "command_id": "end_first_season",
                "type": "end_season",
                "expected_revision": state["revision"],
                "client_timestamp_ms": 1000,
            },
        )
        next_state = await room_service.get_game_state(room_id=room["id"], user=user)
        dry_tiles = [
            tile for key, tile in next_state["grid"].items()
            if key != "0,0" and int(tile.get("hydration") or 0) == -3
        ]

        self.assertGreaterEqual(len(dry_tiles), 2)
        self.assertEqual(next_state["events"], [])
