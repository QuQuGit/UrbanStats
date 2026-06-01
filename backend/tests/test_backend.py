"""Backend tests for Football 5v5 Stats Platform — JWT admin + public reads."""
import os
import time
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN_EMAIL = "qenquen@hotmail.com"
ADMIN_PASSWORD = "130588"


# --- Module-scoped admin token ---
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 0
    assert data["user"]["email"] == ADMIN_EMAIL
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def auth_session(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


# --- Auth -------------------------------------------------------------------
class TestAuth:
    def test_login_success_returns_token_and_user(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and len(d["token"]) > 20
        assert d["user"]["role"] == "admin"
        assert d["user"]["email"] == ADMIN_EMAIL

    def test_login_wrong_password_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": "wrongpass"},
        )
        assert r.status_code == 401
        assert r.json().get("detail") == "Email ou mot de passe incorrect"

    def test_login_unknown_email_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": "nobody@example.com", "password": "x"},
        )
        assert r.status_code == 401

    def test_me_without_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_bad_token_401(self):
        r = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer this.is.not.a.jwt"},
        )
        assert r.status_code == 401

    def test_me_with_valid_token(self, auth_session):
        r = auth_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d["role"] == "admin"
        assert "password_hash" not in d
        assert "user_id" in d


# --- Public reads (no auth) -------------------------------------------------
class TestPublicReads:
    def test_players_public(self):
        r = requests.get(f"{BASE_URL}/api/players")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_matches_public(self):
        r = requests.get(f"{BASE_URL}/api/matches")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_global_public(self):
        r = requests.get(f"{BASE_URL}/api/stats/global")
        assert r.status_code == 200
        for k in ("total_matches", "total_goals", "total_players", "active_players"):
            assert k in r.json()

    def test_stats_players_public(self):
        r = requests.get(f"{BASE_URL}/api/stats/players")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_stats_player_detail_public(self):
        players = requests.get(f"{BASE_URL}/api/players").json()
        if not players:
            pytest.skip("no players to inspect")
        pid = players[0]["id"]
        r = requests.get(f"{BASE_URL}/api/stats/player/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert "player" in d and "stats" in d
        assert "best_teammates" in d and "tough_opponents" in d

    def test_team_generator_public(self):
        players = requests.get(f"{BASE_URL}/api/players").json()
        if len(players) < 4:
            pytest.skip("need 4 players")
        pids = [p["id"] for p in players[:4]]
        r = requests.post(
            f"{BASE_URL}/api/team-generator",
            json={"player_ids": pids},
        )
        assert r.status_code == 200
        d = r.json()
        assert "options" in d and len(d["options"]) == 3
        strategies = {o["strategy"] for o in d["options"]}
        assert strategies == {"best", "competitive", "random_fair"}


# --- Writes WITHOUT token = 401 ---------------------------------------------
class TestWriteUnauthorized:
    def test_create_player_401(self):
        r = requests.post(f"{BASE_URL}/api/players", json={"name": "Hacker"})
        assert r.status_code == 401

    def test_patch_player_401(self):
        r = requests.patch(f"{BASE_URL}/api/players/plr_xxx", json={"name": "x"})
        assert r.status_code == 401

    def test_delete_player_401(self):
        r = requests.delete(f"{BASE_URL}/api/players/plr_xxx")
        assert r.status_code == 401

    def test_create_match_401(self):
        r = requests.post(
            f"{BASE_URL}/api/matches",
            json={"date": "2026-01-01", "team_a": ["a"], "team_b": ["b"], "score_a": 1, "score_b": 0},
        )
        assert r.status_code == 401

    def test_patch_match_401(self):
        r = requests.patch(f"{BASE_URL}/api/matches/mat_xxx", json={"score_a": 9})
        assert r.status_code == 401

    def test_delete_match_401(self):
        r = requests.delete(f"{BASE_URL}/api/matches/mat_xxx")
        assert r.status_code == 401


# --- Writes WITH admin token = 200 ------------------------------------------
class TestAdminCRUD:
    created_player_id = None
    created_match_id = None
    extra_pids = []

    def test_create_player_ok(self, auth_session):
        name = f"TEST_AdminPlr_{int(time.time())}"
        r = auth_session.post(f"{BASE_URL}/api/players", json={"name": name})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name and d["id"].startswith("plr_")
        TestAdminCRUD.created_player_id = d["id"]
        TestAdminCRUD._name = name
        # GET verify persistence
        listing = requests.get(f"{BASE_URL}/api/players").json()
        assert any(p["id"] == d["id"] for p in listing)

    def test_patch_player_ok(self, auth_session):
        new_name = TestAdminCRUD._name + "_R"
        r = auth_session.patch(
            f"{BASE_URL}/api/players/{TestAdminCRUD.created_player_id}",
            json={"name": new_name, "active": False},
        )
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == new_name and d["active"] is False

    def test_create_match_ok(self, auth_session):
        # need 4 players
        for i in range(3):  # plus our created player = 4
            n = f"TEST_AdminM_{i}_{int(time.time())}"
            r = auth_session.post(f"{BASE_URL}/api/players", json={"name": n})
            assert r.status_code == 200
            TestAdminCRUD.extra_pids.append(r.json()["id"])
        pids = [TestAdminCRUD.created_player_id] + TestAdminCRUD.extra_pids
        r = auth_session.post(
            f"{BASE_URL}/api/matches",
            json={
                "date": "2026-01-20",
                "team_a": pids[:2],
                "team_b": pids[2:],
                "score_a": 4,
                "score_b": 2,
            },
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith("mat_")
        TestAdminCRUD.created_match_id = d["id"]

    def test_patch_match_ok(self, auth_session):
        r = auth_session.patch(
            f"{BASE_URL}/api/matches/{TestAdminCRUD.created_match_id}",
            json={"score_a": 5},
        )
        assert r.status_code == 200
        assert r.json()["score_a"] == 5

    def test_delete_match_ok(self, auth_session):
        r = auth_session.delete(f"{BASE_URL}/api/matches/{TestAdminCRUD.created_match_id}")
        assert r.status_code == 200

    def test_delete_players_cleanup(self, auth_session):
        ids = [TestAdminCRUD.created_player_id] + TestAdminCRUD.extra_pids
        for pid in ids:
            r = auth_session.delete(f"{BASE_URL}/api/players/{pid}")
            assert r.status_code in (200, 404)


# --- Idempotent seed: login still works after any prior runs ---------------
class TestSeedIdempotent:
    def test_login_still_works(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert r.status_code == 200
