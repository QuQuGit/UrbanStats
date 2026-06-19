"""Stats engine: computes player statistics and TrueSkill ratings from match history.

We use Microsoft's TrueSkill (Xbox Live) ranking system. Each player has a
Gaussian skill posterior with mean `mu` and standard deviation `sigma`. The
conservative public rating ("skill") shown to users is `mu - 3*sigma`, which
is what TrueSkill calls the "exposure" — the level the system is 99% sure a
player exceeds.

Defaults (from `trueskill.global_env()`):
- mu = 25.0
- sigma = 25/3 ≈ 8.333
- conservative skill at start = 0.0
"""
from __future__ import annotations
from typing import Dict, List, Any, Tuple
from collections import defaultdict
from itertools import combinations

import trueskill

# Use library defaults; explicit init so we control draw probability for football.
TS_ENV = trueskill.TrueSkill(draw_probability=0.10)

INITIAL_MU = TS_ENV.mu
INITIAL_SIGMA = TS_ENV.sigma
INITIAL_SKILL = round(INITIAL_MU - 3 * INITIAL_SIGMA, 2)  # 0.0


def _expose(rating: trueskill.Rating) -> float:
    return rating.mu - 3 * rating.sigma


def _expected_win_prob(team_a: List[trueskill.Rating], team_b: List[trueskill.Rating]) -> float:
    """Expected win probability of team A against team B (under TrueSkill assumptions)."""
    import math
    delta_mu = sum(r.mu for r in team_a) - sum(r.mu for r in team_b)
    sum_sigma2 = sum(r.sigma ** 2 for r in team_a) + sum(r.sigma ** 2 for r in team_b)
    size = len(team_a) + len(team_b)
    beta = TS_ENV.beta
    denom = math.sqrt(size * (beta * beta) + sum_sigma2)
    return TS_ENV.cdf(delta_mu / denom) if hasattr(TS_ENV, "cdf") else 0.5 + 0.5 * math.erf(delta_mu / (denom * math.sqrt(2)))


def sort_matches(matches: List[dict]) -> List[dict]:
    def k(m):
        d = m.get("date")
        return str(d) if d else ""
    return sorted(matches, key=k)


def replay_matches(matches: List[dict]) -> Dict[str, Any]:
    """Replay match history and return per-player aggregated stats + TrueSkill history."""
    matches = sort_matches(matches)

    ratings: Dict[str, trueskill.Rating] = defaultdict(lambda: TS_ENV.create_rating())
    highest: Dict[str, float] = defaultdict(lambda: INITIAL_SKILL)
    lowest: Dict[str, float] = defaultdict(lambda: INITIAL_SKILL)
    skill_history: Dict[str, List[dict]] = defaultdict(list)
    skill_change_history: Dict[str, List[float]] = defaultdict(list)

    played = defaultdict(int)
    wins = defaultdict(int)
    draws = defaultdict(int)
    losses = defaultdict(int)
    goals_scored = defaultdict(int)
    goals_conceded = defaultdict(int)
    current_streak: Dict[str, Tuple[str, int]] = defaultdict(lambda: ("", 0))
    longest_win: Dict[str, int] = defaultdict(int)
    longest_loss: Dict[str, int] = defaultdict(int)
    last_results: Dict[str, List[str]] = defaultdict(list)

    teammate_stats: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(
        lambda: {"together": 0, "wins": 0, "draws": 0, "losses": 0}
    )
    opponent_stats: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(
        lambda: {"against": 0, "wins_a": 0, "draws": 0, "losses_a": 0}
    )

    for m in matches:
        team_a: List[str] = list(m.get("team_a", []))
        team_b: List[str] = list(m.get("team_b", []))
        score_a: int = int(m.get("score_a", 0))
        score_b: int = int(m.get("score_b", 0))
        match_id = m.get("id")
        match_date = m.get("date")

        if not team_a or not team_b:
            continue

        before_skill = {p: _expose(ratings[p]) for p in team_a + team_b}

        # TrueSkill rating update
        ratings_a = [ratings[p] for p in team_a]
        ratings_b = [ratings[p] for p in team_b]
        if score_a > score_b:
            ranks = [0, 1]
        elif score_a < score_b:
            ranks = [1, 0]
        else:
            ranks = [0, 0]
        new_a, new_b = TS_ENV.rate([ratings_a, ratings_b], ranks=ranks)
        for p, r in zip(team_a, new_a):
            ratings[p] = r
        for p, r in zip(team_b, new_b):
            ratings[p] = r

        # Per-player updates
        for p in team_a:
            played[p] += 1
            goals_scored[p] += score_a
            goals_conceded[p] += score_b
            if score_a > score_b:
                wins[p] += 1
                res = "W"
            elif score_a < score_b:
                losses[p] += 1
                res = "L"
            else:
                draws[p] += 1
                res = "D"
            last_results[p].append(res)
            kind, count = current_streak[p]
            current_streak[p] = (res, count + 1 if kind == res else 1)
            if res == "W":
                longest_win[p] = max(longest_win[p], current_streak[p][1])
            elif res == "L":
                longest_loss[p] = max(longest_loss[p], current_streak[p][1])
            skill_now = _expose(ratings[p])
            highest[p] = max(highest[p], skill_now)
            lowest[p] = min(lowest[p], skill_now)
            skill_history[p].append({"match_id": match_id, "date": match_date, "skill": round(skill_now, 2)})
            skill_change_history[p].append(skill_now - before_skill[p])

        for p in team_b:
            played[p] += 1
            goals_scored[p] += score_b
            goals_conceded[p] += score_a
            if score_b > score_a:
                wins[p] += 1
                res = "W"
            elif score_b < score_a:
                losses[p] += 1
                res = "L"
            else:
                draws[p] += 1
                res = "D"
            last_results[p].append(res)
            kind, count = current_streak[p]
            current_streak[p] = (res, count + 1 if kind == res else 1)
            if res == "W":
                longest_win[p] = max(longest_win[p], current_streak[p][1])
            elif res == "L":
                longest_loss[p] = max(longest_loss[p], current_streak[p][1])
            skill_now = _expose(ratings[p])
            highest[p] = max(highest[p], skill_now)
            lowest[p] = min(lowest[p], skill_now)
            skill_history[p].append({"match_id": match_id, "date": match_date, "skill": round(skill_now, 2)})
            skill_change_history[p].append(skill_now - before_skill[p])

        # teammate / opponent aggregates
        for a in team_a:
            for b in team_a:
                if a >= b:
                    continue
                ts = teammate_stats[(a, b)]
                ts["together"] += 1
                if score_a > score_b:
                    ts["wins"] += 1
                elif score_a == score_b:
                    ts["draws"] += 1
                else:
                    ts["losses"] += 1
        for a in team_b:
            for b in team_b:
                if a >= b:
                    continue
                ts = teammate_stats[(a, b)]
                ts["together"] += 1
                if score_b > score_a:
                    ts["wins"] += 1
                elif score_a == score_b:
                    ts["draws"] += 1
                else:
                    ts["losses"] += 1
        for a in team_a:
            for b in team_b:
                op = opponent_stats[(a, b)]
                op["against"] += 1
                if score_a > score_b:
                    op["wins_a"] += 1
                elif score_a == score_b:
                    op["draws"] += 1
                else:
                    op["losses_a"] += 1
                op2 = opponent_stats[(b, a)]
                op2["against"] += 1
                if score_b > score_a:
                    op2["wins_a"] += 1
                elif score_a == score_b:
                    op2["draws"] += 1
                else:
                    op2["losses_a"] += 1

    result: Dict[str, Any] = {}
    for p in played.keys():
        pl = played[p] or 1
        gs = goals_scored[p]
        gc = goals_conceded[p]
        last10 = skill_change_history[p][-10:]
        last_results_str = "".join(last_results[p][-5:])
        kind, count = current_streak[p]
        r = ratings[p]
        result[p] = {
            "player_id": p,
            "matches_played": played[p],
            "wins": wins[p],
            "draws": draws[p],
            "losses": losses[p],
            "win_rate": round(wins[p] / pl * 100, 1),
            "goals_scored": gs,
            "goals_conceded": gc,
            "goal_diff": gs - gc,
            "avg_goals_scored": round(gs / pl, 2),
            "avg_goals_conceded": round(gc / pl, 2),
            "points": wins[p] * 3 + draws[p],
            "trueskill": round(_expose(r), 2),
            "mu": round(r.mu, 2),
            "sigma": round(r.sigma, 2),
            "highest_trueskill": round(highest[p], 2),
            "lowest_trueskill": round(lowest[p], 2),
            "trueskill_change_last10": round(sum(last10), 2),
            "current_streak": {"kind": kind, "count": count},
            "longest_win_streak": longest_win[p],
            "longest_loss_streak": longest_loss[p],
            "last_results": last_results_str,
            "trueskill_history": skill_history[p],
        }

    return {
        "players": result,
        "ratings": dict(ratings),
        "teammate_stats": teammate_stats,
        "opponent_stats": opponent_stats,
    }


def best_teammates_for(player_id: str, teammate_stats, min_together: int = 2, limit: int = 5):
    out = []
    for (a, b), s in teammate_stats.items():
        if player_id not in (a, b):
            continue
        if s["together"] < min_together:
            continue
        other = b if a == player_id else a
        wr = s["wins"] / s["together"] * 100
        out.append({
            "player_id": other, "together": s["together"],
            "wins": s["wins"], "draws": s["draws"], "losses": s["losses"],
            "win_rate": round(wr, 1),
        })
    out.sort(key=lambda x: (-x["win_rate"], -x["together"]))
    return out[:limit]


def worst_opponents_for(player_id: str, opponent_stats, min_against: int = 2, limit: int = 5):
    out = []
    for (a, b), s in opponent_stats.items():
        if a != player_id:
            continue
        if s["against"] < min_against:
            continue
        wr = s["wins_a"] / s["against"] * 100
        out.append({
            "player_id": b, "against": s["against"],
            "wins": s["wins_a"], "draws": s["draws"], "losses": s["losses_a"],
            "win_rate": round(wr, 1),
        })
    out.sort(key=lambda x: (x["win_rate"], -x["against"]))
    return out[:limit]


def generate_balanced_teams(available_player_ids: List[str], player_stats: Dict[str, Any], ratings_lookup: Dict[str, Any] = None, strategy: str = "best") -> Dict[str, Any]:
    """Generate balanced teams (N vs N) using TrueSkill conservative ratings.

    Strategies:
      - 'best': minimize avg-skill difference
      - 'competitive': minimize diff while preferring higher overall avg skill
      - 'random_fair': pick a random combo within top tier of best-balanced
    """
    import random

    n = len(available_player_ids)
    if n < 2 or n % 2 != 0:
        return {"error": "need an even number of players (>=2)"}
    team_size = n // 2

    def skill_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("trueskill", INITIAL_SKILL))

    def matches_of(pid: str) -> int:
        return int(player_stats.get(pid, {}).get("matches_played", 0))

    def win_rate_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("win_rate", 50.0))

    def gd_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("goal_diff", 0))

    ids = available_player_ids
    all_combos = []
    seen = set()
    for combo in combinations(range(n), team_size):
        team_a = [ids[i] for i in combo]
        team_b = [ids[i] for i in range(n) if i not in combo]
        key = (frozenset(team_a), frozenset(team_b))
        rev = (frozenset(team_b), frozenset(team_a))
        if key in seen or rev in seen:
            continue
        seen.add(key)

        avg_a = sum(skill_of(p) for p in team_a) / team_size
        avg_b = sum(skill_of(p) for p in team_b) / team_size
        wr_a = sum(win_rate_of(p) for p in team_a) / team_size
        wr_b = sum(win_rate_of(p) for p in team_b) / team_size
        gd_a = sum(gd_of(p) for p in team_a)
        gd_b = sum(gd_of(p) for p in team_b)
        mp_a = sum(matches_of(p) for p in team_a)
        mp_b = sum(matches_of(p) for p in team_b)

        skill_diff = abs(avg_a - avg_b)
        wr_diff = abs(wr_a - wr_b)
        gd_diff = abs(gd_a - gd_b)
        mp_diff = abs(mp_a - mp_b)

        # Weight differs slightly to keep score on the same magnitude as skill
        score = skill_diff + wr_diff * 0.05 + gd_diff * 0.02 + mp_diff * 0.01
        all_combos.append({
            "team_a": team_a, "team_b": team_b,
            "avg_a": round(avg_a, 2), "avg_b": round(avg_b, 2),
            "skill_diff": round(skill_diff, 2),
            "wr_diff": round(wr_diff, 1),
            "gd_diff": gd_diff,
            "mp_diff": mp_diff,
            "score": round(score, 3),
        })

    if not all_combos:
        return {"error": "no combinations"}

    if strategy == "best":
        all_combos.sort(key=lambda x: x["score"])
        pick = all_combos[0]
    elif strategy == "competitive":
        all_combos.sort(key=lambda x: (x["skill_diff"], -(x["avg_a"] + x["avg_b"])))
        pick = all_combos[0]
    elif strategy == "random_fair":
        all_combos.sort(key=lambda x: x["score"])
        top = all_combos[: max(10, len(all_combos) // 20)]
        pick = random.choice(top)
    else:
        all_combos.sort(key=lambda x: x["score"])
        pick = all_combos[0]

    # Balance percentage: 100% at 0 diff, 0% at ref diff of 15 (TrueSkill scale)
    max_diff_ref = 15.0
    balance_pct = max(0.0, min(100.0, 100.0 - (pick["skill_diff"] / max_diff_ref) * 100.0))

    # Predicted win prob for team A
    predicted_a = 0.5
    if ratings_lookup:
        ra = [ratings_lookup.get(p, TS_ENV.create_rating()) for p in pick["team_a"]]
        rb = [ratings_lookup.get(p, TS_ENV.create_rating()) for p in pick["team_b"]]
        predicted_a = _expected_win_prob(ra, rb)

    return {
        "strategy": strategy,
        "team_a": pick["team_a"],
        "team_b": pick["team_b"],
        "avg_skill_a": pick["avg_a"],
        "avg_skill_b": pick["avg_b"],
        "skill_diff": pick["skill_diff"],
        "win_rate_diff": pick["wr_diff"],
        "goal_diff_diff": pick["gd_diff"],
        "matches_played_diff": pick["mp_diff"],
        "balance_pct": round(balance_pct, 1),
        "predicted_win_prob_a": round(predicted_a * 100, 1),
    }
