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

        published = await service.update_creation(
            creation_id=creation["id"],
            user=user,
            publish=True,
        )
        self.assertEqual(published["status"], "published")
        self.assertEqual([item["id"] for item in await service.list_published_creations()], [creation["id"]])

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
        self.assertEqual(state["max_seasons"], 8)
        self.assertEqual(state["target_maturity"], 50)
