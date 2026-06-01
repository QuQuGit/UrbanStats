"""FastAPI backend for Football 5v5 Statistics Platform.

REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

import requests
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from stats import (
    INITIAL_ELO,
    replay_matches,
    generate_balanced_teams,
    best_duos,
    best_teammates_for,
    worst_opponents_for,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Football 5v5 Stats API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("football5v5")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SessionInput(BaseModel):
    session_id: str


class PlayerCreate(BaseModel):
    name: str
    active: bool = True


class PlayerUpdate(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class Player(BaseModel):
    id: str
    name: str
    active: bool = True
    joined_at: datetime


class MatchCreate(BaseModel):
    date: str  # ISO date
    team_a: List[str]
    team_b: List[str]
    score_a: int
    score_b: int


class MatchUpdate(BaseModel):
    date: Optional[str] = None
    team_a: Optional[List[str]] = None
    team_b: Optional[List[str]] = None
    score_a: Optional[int] = None
    score_b: Optional[int] = None


class Match(BaseModel):
    id: str
    date: str
    team_a: List[str]
    team_b: List[str]
    score_a: int
    score_b: int
    created_at: datetime


class TeamGenInput(BaseModel):
    player_ids: List[str]
    strategy: str = "best"  # 'best' | 'competitive' | 'random_fair'


# ---------------------------------------------------------------------------
# Auth helpers (Emergent-managed Google Auth)
# ---------------------------------------------------------------------------
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_COOKIE_NAME = "session_token"


async def _get_session_token(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> Optional[str]:
    """Read session_token from cookie first, then Authorization header."""
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        return token
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


async def require_user(
    request: Request,
    authorization: Optional[str] = Header(default=None),
) -> dict:
    token = await _get_session_token(request, authorization)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/session")
async def auth_session(payload: SessionInput, response: Response):
    """Exchange session_id from Emergent for our session cookie."""
    headers = {"X-Session-ID": payload.session_id}
    try:
        resp = requests.get(EMERGENT_SESSION_URL, headers=headers, timeout=10)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Auth provider unreachable: {e}")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    data = resp.json()
    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing.get("name")), "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", email),
            "picture": data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user}


@api.get("/auth/me")
async def auth_me(user: dict = Depends(require_user)):
    return user


@api.post("/auth/logout")
async def auth_logout(request: Request, response: Response, authorization: Optional[str] = Header(default=None)):
    token = await _get_session_token(request, authorization)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(SESSION_COOKIE_NAME, path="/", samesite="none", secure=True)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------
@api.get("/players", response_model=List[Player])
async def list_players(user: dict = Depends(require_user)):
    docs = await db.players.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        if isinstance(d.get("joined_at"), str):
            d["joined_at"] = datetime.fromisoformat(d["joined_at"])
    docs.sort(key=lambda p: p["name"].lower())
    return docs


@api.post("/players", response_model=Player)
async def create_player(payload: PlayerCreate, user: dict = Depends(require_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name required")
    existing = await db.players.find_one({"name_lc": name.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Player with same name already exists")
    pid = f"plr_{uuid.uuid4().hex[:10]}"
    now = datetime.now(timezone.utc)
    doc = {
        "id": pid,
        "name": name,
        "name_lc": name.lower(),
        "active": payload.active,
        "joined_at": now.isoformat(),
    }
    await db.players.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("name_lc", None)
    doc["joined_at"] = now
    return doc


@api.patch("/players/{pid}", response_model=Player)
async def update_player(pid: str, payload: PlayerUpdate, user: dict = Depends(require_user)):
    existing = await db.players.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Player not found")
    update = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name required")
        update["name"] = new_name
        update["name_lc"] = new_name.lower()
    if payload.active is not None:
        update["active"] = payload.active
    if update:
        await db.players.update_one({"id": pid}, {"$set": update})
    doc = await db.players.find_one({"id": pid}, {"_id": 0})
    doc.pop("name_lc", None)
    if isinstance(doc.get("joined_at"), str):
        doc["joined_at"] = datetime.fromisoformat(doc["joined_at"])
    return doc


@api.delete("/players/{pid}")
async def delete_player(pid: str, user: dict = Depends(require_user)):
    # Block delete if player has matches
    has_matches = await db.matches.find_one({"$or": [{"team_a": pid}, {"team_b": pid}]})
    if has_matches:
        raise HTTPException(status_code=409, detail="Cannot delete: player has matches. Set inactive instead.")
    res = await db.players.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------
def _validate_match_payload(team_a: List[str], team_b: List[str], score_a: int, score_b: int):
    if not team_a or not team_b:
        raise HTTPException(status_code=400, detail="Both teams must have players")
    if len(team_a) != len(team_b):
        raise HTTPException(status_code=400, detail="Teams must have the same number of players")
    if len(set(team_a)) != len(team_a) or len(set(team_b)) != len(team_b):
        raise HTTPException(status_code=400, detail="Duplicate player in a team")
    overlap = set(team_a) & set(team_b)
    if overlap:
        raise HTTPException(status_code=400, detail="A player cannot be in both teams")
    if score_a < 0 or score_b < 0:
        raise HTTPException(status_code=400, detail="Scores must be non-negative")


async def _ensure_players_exist(ids: List[str]):
    if not ids:
        return
    cursor = db.players.find({"id": {"$in": ids}}, {"_id": 0, "id": 1})
    found = {d["id"] async for d in cursor}
    missing = [pid for pid in ids if pid not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown player ids: {missing}")


@api.get("/matches")
async def list_matches(user: dict = Depends(require_user)):
    docs = await db.matches.find({}, {"_id": 0}).to_list(5000)
    docs.sort(key=lambda m: m.get("date", ""), reverse=True)
    return docs


@api.post("/matches")
async def create_match(payload: MatchCreate, user: dict = Depends(require_user)):
    _validate_match_payload(payload.team_a, payload.team_b, payload.score_a, payload.score_b)
    await _ensure_players_exist(payload.team_a + payload.team_b)
    mid = f"mat_{uuid.uuid4().hex[:10]}"
    doc = {
        "id": mid,
        "date": payload.date,
        "team_a": payload.team_a,
        "team_b": payload.team_b,
        "score_a": payload.score_a,
        "score_b": payload.score_b,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.matches.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api.patch("/matches/{mid}")
async def update_match(mid: str, payload: MatchUpdate, user: dict = Depends(require_user)):
    existing = await db.matches.find_one({"id": mid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Match not found")
    merged = {**existing}
    for key, val in payload.model_dump(exclude_unset=True).items():
        merged[key] = val
    _validate_match_payload(merged["team_a"], merged["team_b"], merged["score_a"], merged["score_b"])
    await _ensure_players_exist(merged["team_a"] + merged["team_b"])
    await db.matches.update_one({"id": mid}, {"$set": {
        "date": merged["date"],
        "team_a": merged["team_a"],
        "team_b": merged["team_b"],
        "score_a": merged["score_a"],
        "score_b": merged["score_b"],
    }})
    doc = await db.matches.find_one({"id": mid}, {"_id": 0})
    return doc


@api.delete("/matches/{mid}")
async def delete_match(mid: str, user: dict = Depends(require_user)):
    res = await db.matches.delete_one({"id": mid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Match not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------
async def _load_all() -> tuple[List[dict], List[dict]]:
    players = await db.players.find({}, {"_id": 0}).to_list(1000)
    matches = await db.matches.find({}, {"_id": 0}).to_list(10000)
    return players, matches


@api.get("/stats/global")
async def stats_global(user: dict = Depends(require_user)):
    players, matches = await _load_all()
    total_goals = sum(m.get("score_a", 0) + m.get("score_b", 0) for m in matches)
    active = sum(1 for p in players if p.get("active", True))
    return {
        "total_matches": len(matches),
        "total_goals": total_goals,
        "total_players": len(players),
        "active_players": active,
    }


@api.get("/stats/players")
async def stats_players(min_matches: int = 0, user: dict = Depends(require_user)):
    players, matches = await _load_all()
    result = replay_matches(matches)
    stats = result["players"]
    out = []
    for p in players:
        pid = p["id"]
        s = stats.get(pid, {
            "player_id": pid, "matches_played": 0, "wins": 0, "draws": 0, "losses": 0,
            "win_rate": 0, "goals_scored": 0, "goals_conceded": 0, "goal_diff": 0,
            "avg_goals_scored": 0, "avg_goals_conceded": 0, "points": 0,
            "elo": INITIAL_ELO, "highest_elo": INITIAL_ELO, "lowest_elo": INITIAL_ELO,
            "elo_change_last10": 0, "current_streak": {"kind": "", "count": 0},
            "longest_win_streak": 0, "longest_loss_streak": 0, "last_results": "", "elo_history": [],
        })
        if s["matches_played"] < min_matches:
            continue
        s = {**s, "name": p["name"], "active": p.get("active", True)}
        s.pop("elo_history", None)
        out.append(s)
    return out


@api.get("/stats/player/{pid}")
async def stats_player(pid: str, user: dict = Depends(require_user)):
    players, matches = await _load_all()
    player = next((p for p in players if p["id"] == pid), None)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    result = replay_matches(matches)
    s = result["players"].get(pid)
    if not s:
        s = {
            "player_id": pid, "matches_played": 0, "wins": 0, "draws": 0, "losses": 0,
            "win_rate": 0, "goals_scored": 0, "goals_conceded": 0, "goal_diff": 0,
            "avg_goals_scored": 0, "avg_goals_conceded": 0, "points": 0,
            "elo": INITIAL_ELO, "highest_elo": INITIAL_ELO, "lowest_elo": INITIAL_ELO,
            "elo_change_last10": 0, "current_streak": {"kind": "", "count": 0},
            "longest_win_streak": 0, "longest_loss_streak": 0, "last_results": "", "elo_history": [],
        }

    name_by_id = {p["id"]: p["name"] for p in players}
    teammates = best_teammates_for(pid, result["teammate_stats"], min_together=1, limit=10)
    for t in teammates:
        t["name"] = name_by_id.get(t["player_id"], "?")
    opponents = worst_opponents_for(pid, result["opponent_stats"], min_against=1, limit=10)
    for o in opponents:
        o["name"] = name_by_id.get(o["player_id"], "?")

    # Player's own match list
    own_matches = [m for m in matches if pid in m.get("team_a", []) or pid in m.get("team_b", [])]
    own_matches.sort(key=lambda m: m.get("date", ""), reverse=True)

    return {
        "player": player,
        "stats": s,
        "best_teammates": teammates,
        "tough_opponents": opponents,
        "matches": own_matches[:50],
    }


@api.post("/team-generator")
async def team_generator(payload: TeamGenInput, user: dict = Depends(require_user)):
    if len(payload.player_ids) < 2 or len(payload.player_ids) % 2 != 0:
        raise HTTPException(status_code=400, detail="Provide an even number of players (>=2)")
    await _ensure_players_exist(payload.player_ids)
    _, matches = await _load_all()
    result = replay_matches(matches)
    stats = result["players"]
    options = []
    for strat in ("best", "competitive", "random_fair"):
        options.append(generate_balanced_teams(payload.player_ids, stats, strategy=strat))
    return {"options": options}


# ---------------------------------------------------------------------------
# Mount + CORS
# ---------------------------------------------------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
