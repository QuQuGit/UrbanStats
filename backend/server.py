"""FastAPI backend for Football 5v5 Statistics Platform.

Auth model:
- Single admin (email/password), JWT Bearer in Authorization header.
- All GET endpoints are PUBLIC.
- All write endpoints (POST/PATCH/DELETE on players + matches) require admin.
- Team generator is PUBLIC (read-only computation).
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, List

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from stats import (
    INITIAL_SKILL,
    replay_matches,
    generate_balanced_teams,
    best_teammates_for,
    worst_opponents_for,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGO = "HS256"
ACCESS_TTL_HOURS = 12

app = FastAPI(title="Football 5v5 Stats API")
api = APIRouter(prefix="/api")

logger = logging.getLogger("football5v5")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TTL_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def get_optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[dict]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            return None
        user = await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        return user
    except jwt.PyJWTError:
        return None


async def require_admin(authorization: Optional[str] = Header(default=None)) -> dict:
    user = await get_optional_user(authorization)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=401, detail="Admin authentication required")
    return user


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


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
    date: str
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


class TeamGenInput(BaseModel):
    player_ids: List[str]
    strategy: str = "best"


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/login")
async def auth_login(payload: LoginInput):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    token = create_access_token(user["user_id"], email)
    return {
        "token": token,
        "user": {
            "user_id": user["user_id"],
            "email": user["email"],
            "name": user.get("name", "Admin"),
            "role": user.get("role", "admin"),
        },
    }


@api.get("/auth/me")
async def auth_me(user: dict = Depends(require_admin)):
    return user


@api.post("/auth/logout")
async def auth_logout():
    # Stateless JWT: client just discards the token.
    return {"ok": True}


# ---------------------------------------------------------------------------
# Players
# ---------------------------------------------------------------------------
@api.get("/players", response_model=List[Player])
async def list_players():
    docs = await db.players.find({}, {"_id": 0}).to_list(1000)
    for d in docs:
        d.pop("name_lc", None)
        if isinstance(d.get("joined_at"), str):
            d["joined_at"] = datetime.fromisoformat(d["joined_at"])
    docs.sort(key=lambda p: p["name"].lower())
    return docs


@api.post("/players", response_model=Player)
async def create_player(payload: PlayerCreate, _: dict = Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nom requis")
    existing = await db.players.find_one({"name_lc": name.lower()}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Un joueur avec ce nom existe déjà")
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
async def update_player(pid: str, payload: PlayerUpdate, _: dict = Depends(require_admin)):
    existing = await db.players.find_one({"id": pid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Joueur introuvable")
    update = {}
    if payload.name is not None:
        new_name = payload.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Nom requis")
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
async def delete_player(pid: str, _: dict = Depends(require_admin)):
    has_matches = await db.matches.find_one({"$or": [{"team_a": pid}, {"team_b": pid}]})
    if has_matches:
        raise HTTPException(status_code=409, detail="Suppression impossible : ce joueur a des matches. Désactivez-le.")
    res = await db.players.delete_one({"id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Joueur introuvable")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Matches
# ---------------------------------------------------------------------------
def _validate_match_payload(team_a: List[str], team_b: List[str], score_a: int, score_b: int):
    if not team_a or not team_b:
        raise HTTPException(status_code=400, detail="Les deux équipes doivent contenir des joueurs")
    if len(team_a) != len(team_b):
        raise HTTPException(status_code=400, detail="Les équipes doivent contenir le même nombre de joueurs")
    if len(set(team_a)) != len(team_a) or len(set(team_b)) != len(team_b):
        raise HTTPException(status_code=400, detail="Joueur en double dans une équipe")
    overlap = set(team_a) & set(team_b)
    if overlap:
        raise HTTPException(status_code=400, detail="Un joueur ne peut pas être dans les deux équipes")
    if score_a < 0 or score_b < 0:
        raise HTTPException(status_code=400, detail="Les scores doivent être positifs")


async def _ensure_players_exist(ids: List[str]):
    if not ids:
        return
    cursor = db.players.find({"id": {"$in": ids}}, {"_id": 0, "id": 1})
    found = {d["id"] async for d in cursor}
    missing = [pid for pid in ids if pid not in found]
    if missing:
        raise HTTPException(status_code=400, detail=f"Joueurs inconnus : {missing}")


@api.get("/matches")
async def list_matches():
    docs = await db.matches.find({}, {"_id": 0}).to_list(5000)
    docs.sort(key=lambda m: m.get("date", ""), reverse=True)
    return docs


@api.post("/matches")
async def create_match(payload: MatchCreate, _: dict = Depends(require_admin)):
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
async def update_match(mid: str, payload: MatchUpdate, _: dict = Depends(require_admin)):
    existing = await db.matches.find_one({"id": mid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Match introuvable")
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
async def delete_match(mid: str, _: dict = Depends(require_admin)):
    res = await db.matches.delete_one({"id": mid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Match introuvable")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats (public)
# ---------------------------------------------------------------------------
async def _load_all() -> tuple[List[dict], List[dict]]:
    players = await db.players.find({}, {"_id": 0}).to_list(1000)
    matches = await db.matches.find({}, {"_id": 0}).to_list(10000)
    return players, matches


@api.get("/stats/global")
async def stats_global():
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
async def stats_players(min_matches: int = 0):
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
            "trueskill": INITIAL_SKILL, "mu": 25.0, "sigma": round(25 / 3, 2),
            "highest_trueskill": INITIAL_SKILL, "lowest_trueskill": INITIAL_SKILL,
            "trueskill_change_last10": 0, "current_streak": {"kind": "", "count": 0},
            "longest_win_streak": 0, "longest_loss_streak": 0, "last_results": "", "trueskill_history": [],
        })
        if s["matches_played"] < min_matches:
            continue
        s = {**s, "name": p["name"], "active": p.get("active", True)}
        s.pop("trueskill_history", None)
        out.append(s)
    return out


@api.get("/stats/player/{pid}")
async def stats_player(pid: str):
    players, matches = await _load_all()
    player = next((p for p in players if p["id"] == pid), None)
    if not player:
        raise HTTPException(status_code=404, detail="Joueur introuvable")
    result = replay_matches(matches)
    s = result["players"].get(pid)
    if not s:
        s = {
            "player_id": pid, "matches_played": 0, "wins": 0, "draws": 0, "losses": 0,
            "win_rate": 0, "goals_scored": 0, "goals_conceded": 0, "goal_diff": 0,
            "avg_goals_scored": 0, "avg_goals_conceded": 0, "points": 0,
            "trueskill": INITIAL_SKILL, "mu": 25.0, "sigma": round(25 / 3, 2),
            "highest_trueskill": INITIAL_SKILL, "lowest_trueskill": INITIAL_SKILL,
            "trueskill_change_last10": 0, "current_streak": {"kind": "", "count": 0},
            "longest_win_streak": 0, "longest_loss_streak": 0, "last_results": "", "trueskill_history": [],
        }

    name_by_id = {p["id"]: p["name"] for p in players}
    teammates = best_teammates_for(pid, result["teammate_stats"], min_together=1, limit=10)
    for t in teammates:
        t["name"] = name_by_id.get(t["player_id"], "?")
    opponents = worst_opponents_for(pid, result["opponent_stats"], min_against=1, limit=10)
    for o in opponents:
        o["name"] = name_by_id.get(o["player_id"], "?")

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
async def team_generator(payload: TeamGenInput):
    if len(payload.player_ids) < 2 or len(payload.player_ids) % 2 != 0:
        raise HTTPException(status_code=400, detail="Sélectionnez un nombre pair de joueurs (>=2)")
    await _ensure_players_exist(payload.player_ids)
    _, matches = await _load_all()
    result = replay_matches(matches)
    stats = result["players"]
    ratings = result["ratings"]
    options = []
    for strat in ("best", "competitive", "random_fair"):
        options.append(generate_balanced_teams(payload.player_ids, stats, ratings_lookup=ratings, strategy=strat))
    return {"options": options}


# ---------------------------------------------------------------------------
# Admin seeding (idempotent)
# ---------------------------------------------------------------------------
async def seed_admin():
    admin_email = os.environ["ADMIN_EMAIL"].lower().strip()
    admin_password = os.environ["ADMIN_PASSWORD"]
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "user_id": f"user_{uuid.uuid4().hex[:12]}",
            "email": admin_email,
            "name": "Admin",
            "role": "admin",
            "password_hash": hash_password(admin_password),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin user seeded: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
        )
        logger.info(f"Admin password updated: {admin_email}")
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.players.create_index("name_lc")


@app.on_event("startup")
async def on_startup():
    await seed_admin()


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
