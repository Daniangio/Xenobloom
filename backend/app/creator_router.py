from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from .runtime_state import get_creation_service
from .schemas import CreationCreateRequest, CreationListResponse, CreationResponse, CreationUpdateRequest
from .security import get_current_user
from .server_models import User


router = APIRouter()


def _service():
    service = get_creation_service()
    if service is None:
        raise HTTPException(status_code=503, detail="Creation service is unavailable.")
    return service


@router.get("/creations/mine", response_model=CreationListResponse)
async def list_my_creations(current_user: User = Depends(get_current_user)):
    return CreationListResponse(creations=await _service().list_user_creations(user_id=current_user.id))


@router.get("/creations/published", response_model=CreationListResponse)
async def list_published_creations(current_user: User = Depends(get_current_user)):
    return CreationListResponse(creations=await _service().list_published_creations())


@router.post("/creations", response_model=CreationResponse)
async def create_creation(payload: CreationCreateRequest, current_user: User = Depends(get_current_user)):
    return await _service().create_creation(
        user=current_user,
        name=payload.name,
        description=payload.description,
        payload=payload.payload.model_dump() if payload.payload else None,
    )


@router.get("/creations/{creation_id}", response_model=CreationResponse)
async def get_creation(creation_id: str, current_user: User = Depends(get_current_user)):
    creation = await _service().get_creation(creation_id=creation_id, user=current_user)
    if creation is None:
        raise HTTPException(status_code=404, detail="Creation not found.")
    return creation


@router.put("/creations/{creation_id}", response_model=CreationResponse)
async def update_creation(
    creation_id: str,
    payload: CreationUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    creation = await _service().update_creation(
        creation_id=creation_id,
        user=current_user,
        name=payload.name,
        description=payload.description,
        payload=payload.payload.model_dump() if payload.payload else None,
        publish=payload.publish,
    )
    if creation is None:
        raise HTTPException(status_code=404, detail="Creation not found.")
    return creation


@router.delete("/creations/{creation_id}")
async def delete_creation(creation_id: str, current_user: User = Depends(get_current_user)):
    deleted = await _service().delete_creation(creation_id=creation_id, user=current_user)
    if not deleted:
        raise HTTPException(status_code=404, detail="Creation not found.")
    return {"status": "deleted"}
