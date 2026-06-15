from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from .runtime_state import get_creation_service, get_game_room_service
from .game_config_loader import get_game_config
from .schemas import (
    GameCommandQueuedResponse,
    GameCommandRequest,
    GameHistoryResponse,
    GameResultResponse,
    GameRoomCreateRequest,
    GameRoomResponse,
    GameStateResponse,
)
from .security import get_current_user
from .server_models import User


router = APIRouter()


def _service():
    service = get_game_room_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Game room service is unavailable.")
    return service


@router.post("/game/rooms", response_model=GameRoomResponse)
async def create_game_room(
    payload: GameRoomCreateRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        creation = None
        if str(payload.game_type or "") == "creation":
            creation_service = get_creation_service()
            if creation_service is None:
                raise ValueError("Creation service is unavailable.")
            creation = await creation_service.get_creation(
                creation_id=str(payload.creation_id or ""),
                require_published=True,
            )
            if creation is None:
                raise ValueError("Creation not found or is not published.")
        return await _service().create_room(user=current_user, game_type=payload.game_type, creation=creation)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/game/config")
async def get_game_config_payload(current_user: User = Depends(get_current_user)):
    return get_game_config().public_payload()


@router.get("/game/rooms/{room_id}", response_model=GameRoomResponse)
async def get_game_room(room_id: str, current_user: User = Depends(get_current_user)):
    room = await _service().get_room(room_id=room_id, user=current_user)
    if room is None:
        raise HTTPException(status_code=404, detail="Game room not found.")
    return room


@router.post("/game/rooms/{room_id}/end", response_model=GameRoomResponse)
async def end_game_room(room_id: str, current_user: User = Depends(get_current_user)):
    try:
        return await _service().enqueue_end_room(room_id=room_id, user=current_user)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/game/rooms/{room_id}/state", response_model=GameStateResponse)
async def get_game_state(
    room_id: str,
    selected_tile: str | None = None,
    current_user: User = Depends(get_current_user),
):
    state = await _service().get_game_state(
        room_id=room_id,
        user=current_user,
        selected_tile=selected_tile,
    )
    if state is None:
        raise HTTPException(status_code=404, detail="Game state not found.")
    return state


@router.post("/game/rooms/{room_id}/commands", response_model=GameCommandQueuedResponse)
async def enqueue_game_command(
    room_id: str,
    payload: GameCommandRequest,
    current_user: User = Depends(get_current_user),
):
    try:
        return await _service().enqueue_game_command(
            room_id=room_id,
            user=current_user,
            command=payload.model_dump(),
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/game/results/{room_id}", response_model=GameResultResponse)
async def get_game_result(room_id: str, current_user: User = Depends(get_current_user)):
    result = await _service().get_result(room_id=room_id, user_id=current_user.id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game result not found.")
    return result


@router.get("/game/history", response_model=GameHistoryResponse)
async def get_game_history(current_user: User = Depends(get_current_user)):
    return GameHistoryResponse(results=await _service().list_history(user_id=current_user.id))
