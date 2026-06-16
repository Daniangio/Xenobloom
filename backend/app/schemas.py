from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UserPublic(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_admin: bool = False
    online: bool = False


class PlayerProfile(BaseModel):
    user: UserPublic
    is_self: bool = False
    friend_status: str = "none"
    friends_count: int = 0


class FriendUserSummary(BaseModel):
    id: str
    username: str


class FriendRequestCreate(BaseModel):
    username: Optional[str] = None
    target_user_id: Optional[str] = None


class FriendRequestRespond(BaseModel):
    accept: bool


class FriendListEntry(BaseModel):
    user: FriendUserSummary
    since: Optional[datetime] = None


class PendingFriendRequestEntry(BaseModel):
    request_id: str
    user: FriendUserSummary
    created_at: datetime


class FriendsSummaryResponse(BaseModel):
    friends: List[FriendListEntry]
    incoming_requests: List[PendingFriendRequestEntry]
    outgoing_requests: List[PendingFriendRequestEntry]


class SessionStateResponse(BaseModel):
    user_id: str


class LobbyStateResponse(BaseModel):
    users: List[UserPublic]


class GameRoomCreateRequest(BaseModel):
    mode: str = "solo"
    game_type: str = "quick_match"
    creation_id: Optional[str] = None


class GameRoomResponse(BaseModel):
    id: str
    owner_user_id: str
    mode: str
    game_type: str
    state: str
    created_at: str
    started_at: str
    ended_at: Optional[str] = None
    result_id: Optional[str] = None


class GameCommandRequest(BaseModel):
    command_id: str
    type: str
    expected_revision: Optional[int] = None
    client_timestamp_ms: Optional[int] = None
    tile_key: Optional[str] = None
    building_type: Optional[str] = None
    upgrade_id: Optional[str] = None


class GameCommandQueuedResponse(BaseModel):
    status: str
    command_id: str
    revision: int


class GameStateResponse(BaseModel):
    revision: int
    phase: str
    game_over: Optional[str] = None
    season: int
    max_seasons: int
    target_maturity: int
    wind_dir: int
    wind_label: str
    current_wind_dir: Optional[int] = None
    current_wind_label: Optional[str] = None
    actions_left: int
    maturity: int
    strains: Dict[str, int]
    strain_maturity: int
    global_upgrades: Dict[str, bool]
    aquifer: Dict[str, Any] = Field(default_factory=dict)
    events: List[Dict[str, Any]] = Field(default_factory=list)
    base_economy: Dict[str, Any]
    live_economy: Dict[str, Any]
    resources: Dict[str, Any]
    available_life: int
    logs: List[str]
    grid: Dict[str, Any]
    config: Dict[str, Any]
    selected_tile: Optional[Dict[str, Any]] = None
    selected_element: Optional[Dict[str, Any]] = None
    available_actions: List[Dict[str, Any]]


class GameResultResponse(BaseModel):
    id: str
    room_id: str
    mode: str
    game_type: str
    outcome: str
    maturity: int
    turns: int
    duration_seconds: int
    summary: str
    created_at: str


class GameHistoryResponse(BaseModel):
    results: List[GameResultResponse]


class CreationPayload(BaseModel):
    version: int = 1
    tiles: Dict[str, Dict[str, Any]] = {}
    goals: Dict[str, Any] = {}


class CreationCreateRequest(BaseModel):
    name: str = "Untitled Creation"
    description: str = ""
    payload: Optional[CreationPayload] = None


class CreationUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    payload: Optional[CreationPayload] = None
    publish: Optional[bool] = None


class CreationResponse(BaseModel):
    id: str
    owner_user_id: str
    owner_username: str = ""
    name: str
    description: str = ""
    status: str
    created_at: str
    updated_at: str
    published_at: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


class CreationListResponse(BaseModel):
    creations: List[CreationResponse]


class AuthMeResponse(BaseModel):
    uid: str
    email: Optional[str] = None
    username: str
    auth_provider: Optional[str] = None
    player_exists: bool
    is_admin: bool = False


class AdminUserSummary(BaseModel):
    id: str
    username: str
    email: Optional[str] = None
    is_admin: bool
    online: bool = False


class AdminUserAdminUpdate(BaseModel):
    is_admin: bool


class AdminUserDetail(BaseModel):
    user: UserPublic
    friends_count: int = 0
    incoming_requests_count: int = 0
    outgoing_requests_count: int = 0


class AdminMutationStatus(BaseModel):
    status: str
    message: Optional[str] = None


class AdminAuditLogEntry(BaseModel):
    id: str
    admin_user_id: str
    admin_username: str
    action: str
    target_type: str
    target_id: str
    payload: Dict[str, Any]
    created_at: datetime
