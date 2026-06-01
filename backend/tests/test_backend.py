"""Backend tests for Football 5v5 Stats Platform."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://elo-kickoff.preview.emergentagent.com").rstrip("/")
TOKEN = "tok_smoke_test"
H = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update(H)
    return sess


# --- Auth ---
class TestAuth:
    def test_me_without_token_401(self):
        r = requests.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 401

    def test_me_with_token_ok(self, s):
        r = s.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "smoke@test.com"
        assert "user_id" in data


# --- Players CRUD ---
class TestPlayers:
    created_id = None

    def test_list_initial(self, s):
        r = s.get(f"{BASE_URL}/api/players")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_player(self, s):
        name = f"TEST_Player_{int(time.time())}"
        r = s.post(f"{BASE_URL}/api/players", json={"name": name})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == name
        assert d["active"] is True
        assert d["id"].startswith("plr_")
        TestPlayers.created_id = d["id"]
        TestPlayers.created_name = name

    def test_create_duplicate_409(self, s):
        r = s.post(f"{BASE_URL}/api/players", json={"name": TestPlayers.created_name})
        assert r.status_code == 409

    def test_rename_and_toggle(self, s):
        new_name = TestPlayers.created_name + "_R"
        r = s.patch(f"{BASE_URL}/api/players/{TestPlayers.created_id}",
                    json={"name": new_name, "active": False})
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == new_name
        assert d["active"] is False
        # GET verify persistence
        r2 = s.get(f"{BASE_URL}/api/players")
        found = next((p for p in r2.json() if p["id"] == TestPlayers.created_id), None)
        assert found and found["name"] == new_name and found["active"] is False

    def test_delete_player_without_matches(self, s):
        r = s.delete(f"{BASE_URL}/api/players/{TestPlayers.created_id}")
        assert r.status_code == 200
        assert r.json()["ok"] is True


# --- Matches CRUD + validation ---
class TestMatches:
    pids = []
    match_id = None

    @classmethod
    def setup_class(cls):
        # create 4 players for match
        sess = requests.Session()
        sess.headers.update(H)
        cls.pids = []
        for i in range(4):
            name = f"TEST_M_{i}_{int(time.time())}"
            r = sess.post(f"{BASE_URL}/api/players", json={"name": name})
            assert r.status_code == 200
            cls.pids.append(r.json()["id"])
        cls.sess = sess

    @classmethod
    def teardown_class(cls):
        # delete match then players
        if cls.match_id:
            cls.sess.delete(f"{BASE_URL}/api/matches/{cls.match_id}")
        for pid in cls.pids:
            cls.sess.delete(f"{BASE_URL}/api/players/{pid}")

    def test_create_match_uneven_400(self):
        r = self.sess.post(f"{BASE_URL}/api/matches", json={
            "date": "2026-01-15", "team_a": self.pids[:1], "team_b": self.pids[1:3],
            "score_a": 1, "score_b": 0
        })
        assert r.status_code == 400

    def test_create_match_overlap_400(self):
        r = self.sess.post(f"{BASE_URL}/api/matches", json={
            "date": "2026-01-15",
            "team_a": [self.pids[0], self.pids[1]],
            "team_b": [self.pids[1], self.pids[2]],
            "score_a": 1, "score_b": 0
        })
        assert r.status_code == 400

    def test_create_match_ok(self):
        r = self.sess.post(f"{BASE_URL}/api/matches", json={
            "date": "2026-01-15",
            "team_a": [self.pids[0], self.pids[1]],
            "team_b": [self.pids[2], self.pids[3]],
            "score_a": 3, "score_b": 1
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"].startswith("mat_")
        assert d["score_a"] == 3
        TestMatches.match_id = d["id"]

    def test_list_matches_desc(self):
        r = self.sess.get(f"{BASE_URL}/api/matches")
        assert r.status_code == 200
        data = r.json()
        dates = [m["date"] for m in data]
        assert dates == sorted(dates, reverse=True)

    def test_patch_match(self):
        r = self.sess.patch(f"{BASE_URL}/api/matches/{self.match_id}", json={"score_a": 5})
        assert r.status_code == 200
        assert r.json()["score_a"] == 5

    def test_elo_after_match(self):
        # players 0,1 won -> ELO should be > 1500, 2,3 < 1500
        r = self.sess.get(f"{BASE_URL}/api/stats/players")
        assert r.status_code == 200
        by_id = {p["player_id"]: p for p in r.json()}
        assert by_id[self.pids[0]]["elo"] > 1500
        assert by_id[self.pids[1]]["elo"] > 1500
        assert by_id[self.pids[2]]["elo"] < 1500
        assert by_id[self.pids[3]]["elo"] < 1500

    def test_delete_player_with_match_blocked(self):
        r = self.sess.delete(f"{BASE_URL}/api/players/{self.pids[0]}")
        assert r.status_code == 409


# --- Stats ---
class TestStats:
    def test_global(self, s):
        r = s.get(f"{BASE_URL}/api/stats/global")
        assert r.status_code == 200
        d = r.json()
        for k in ("total_matches", "total_goals", "total_players", "active_players"):
            assert k in d

    def test_players(self, s):
        r = s.get(f"{BASE_URL}/api/stats/players")
        assert r.status_code == 200
        arr = r.json()
        assert isinstance(arr, list)
        if arr:
            p = arr[0]
            for k in ("player_id", "matches_played", "elo", "win_rate", "goal_diff"):
                assert k in p

    def test_player_detail(self, s):
        # get any existing player
        players = s.get(f"{BASE_URL}/api/players").json()
        if not players:
            pytest.skip("no players")
        pid = players[0]["id"]
        r = s.get(f"{BASE_URL}/api/stats/player/{pid}")
        assert r.status_code == 200
        d = r.json()
        assert "player" in d and "stats" in d
        assert "best_teammates" in d and "tough_opponents" in d
        assert "elo_history" in d["stats"]
        assert "matches" in d


# --- Team Generator ---
class TestTeamGenerator:
    def test_odd_count_400(self, s):
        players = s.get(f"{BASE_URL}/api/players").json()
        if len(players) < 3:
            pytest.skip("not enough players")
        r = s.post(f"{BASE_URL}/api/team-generator",
                   json={"player_ids": [p["id"] for p in players[:3]]})
        assert r.status_code == 400

    def test_even_returns_3_options(self, s):
        players = s.get(f"{BASE_URL}/api/players").json()
        if len(players) < 4:
            pytest.skip("not enough players")
        pids = [p["id"] for p in players[:4]]
        r = s.post(f"{BASE_URL}/api/team-generator", json={"player_ids": pids})
        assert r.status_code == 200, r.text
        d = r.json()
        assert "options" in d
        assert len(d["options"]) == 3
        strategies = {o["strategy"] for o in d["options"]}
        assert strategies == {"best", "competitive", "random_fair"}
        for o in d["options"]:
            assert "balance_pct" in o
            assert "predicted_win_prob_a" in o
            assert len(o["team_a"]) == 2 and len(o["team_b"]) == 2
