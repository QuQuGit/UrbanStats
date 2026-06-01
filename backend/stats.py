"""Stats engine: computes player statistics and ELO from match history."""
from __future__ import annotations
from typing import Dict, List, Any, Tuple
from collections import defaultdict
from itertools import combinations

INITIAL_ELO = 1500
K_FACTOR = 32


def _expected(own_avg: float, opp_avg: float) -> float:
    return 1.0 / (1.0 + 10 ** ((opp_avg - own_avg) / 400.0))


def _outcome(score_own: int, score_opp: int) -> float:
    if score_own > score_opp:
        return 1.0
    if score_own < score_opp:
        return 0.0
    return 0.5


def sort_matches(matches: List[dict]) -> List[dict]:
    """Sort matches chronologically. Date can be ISO string or datetime."""
    def k(m):
        d = m.get("date")
        return str(d) if d else ""
    return sorted(matches, key=k)


def replay_matches(matches: List[dict]) -> Dict[str, Any]:
    """Replay match history and return per-player aggregated stats + ELO history.

    Returns dict: { player_id: { stats..., elo_history: [{match_id, date, elo}] } }
    Players are auto-tracked from matches; pass in player ids if you want all.
    """
    matches = sort_matches(matches)

    elo: Dict[str, float] = defaultdict(lambda: float(INITIAL_ELO))
    highest: Dict[str, float] = defaultdict(lambda: float(INITIAL_ELO))
    lowest: Dict[str, float] = defaultdict(lambda: float(INITIAL_ELO))
    elo_history: Dict[str, List[dict]] = defaultdict(list)

    played = defaultdict(int)
    wins = defaultdict(int)
    draws = defaultdict(int)
    losses = defaultdict(int)
    goals_scored = defaultdict(int)
    goals_conceded = defaultdict(int)
    # streaks
    current_streak: Dict[str, Tuple[str, int]] = defaultdict(lambda: ("", 0))  # ('W'|'L'|'D', count)
    longest_win: Dict[str, int] = defaultdict(int)
    longest_loss: Dict[str, int] = defaultdict(int)
    last_results: Dict[str, List[str]] = defaultdict(list)

    # teammate/opponent aggregates: (a,b) -> {together_matches, wins_together} ; (a,b)->{matches_against, wins_a}
    teammate_stats: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(lambda: {"together": 0, "wins": 0, "draws": 0, "losses": 0})
    opponent_stats: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(lambda: {"against": 0, "wins_a": 0, "draws": 0, "losses_a": 0})

    elo_change_history: Dict[str, List[float]] = defaultdict(list)

    for m in matches:
        team_a: List[str] = list(m.get("team_a", []))
        team_b: List[str] = list(m.get("team_b", []))
        score_a: int = int(m.get("score_a", 0))
        score_b: int = int(m.get("score_b", 0))
        match_id = m.get("id")
        match_date = m.get("date")

        if not team_a or not team_b:
            continue

        avg_a = sum(elo[p] for p in team_a) / len(team_a)
        avg_b = sum(elo[p] for p in team_b) / len(team_b)
        exp_a = _expected(avg_a, avg_b)
        exp_b = 1 - exp_a
        out_a = _outcome(score_a, score_b)
        out_b = 1 - out_a

        delta_a = K_FACTOR * (out_a - exp_a)
        delta_b = K_FACTOR * (out_b - exp_b)

        for p in team_a:
            elo[p] += delta_a
            elo_change_history[p].append(delta_a)
            highest[p] = max(highest[p], elo[p])
            lowest[p] = min(lowest[p], elo[p])
            elo_history[p].append({"match_id": match_id, "date": match_date, "elo": round(elo[p], 1)})
            played[p] += 1
            goals_scored[p] += score_a
            goals_conceded[p] += score_b
            if score_a > score_b:
                wins[p] += 1; res = "W"
            elif score_a < score_b:
                losses[p] += 1; res = "L"
            else:
                draws[p] += 1; res = "D"
            last_results[p].append(res)
            kind, count = current_streak[p]
            if kind == res:
                current_streak[p] = (res, count + 1)
            else:
                current_streak[p] = (res, 1)
            if res == "W":
                longest_win[p] = max(longest_win[p], current_streak[p][1])
            elif res == "L":
                longest_loss[p] = max(longest_loss[p], current_streak[p][1])

        for p in team_b:
            elo[p] += delta_b
            elo_change_history[p].append(delta_b)
            highest[p] = max(highest[p], elo[p])
            lowest[p] = min(lowest[p], elo[p])
            elo_history[p].append({"match_id": match_id, "date": match_date, "elo": round(elo[p], 1)})
            played[p] += 1
            goals_scored[p] += score_b
            goals_conceded[p] += score_a
            if score_b > score_a:
                wins[p] += 1; res = "W"
            elif score_b < score_a:
                losses[p] += 1; res = "L"
            else:
                draws[p] += 1; res = "D"
            last_results[p].append(res)
            kind, count = current_streak[p]
            if kind == res:
                current_streak[p] = (res, count + 1)
            else:
                current_streak[p] = (res, 1)
            if res == "W":
                longest_win[p] = max(longest_win[p], current_streak[p][1])
            elif res == "L":
                longest_loss[p] = max(longest_loss[p], current_streak[p][1])

        # teammates
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
        # opponents (we store both directions for easy lookup)
        for a in team_a:
            for b in team_b:
                key = (a, b)
                op = opponent_stats[key]
                op["against"] += 1
                if score_a > score_b:
                    op["wins_a"] += 1
                elif score_a == score_b:
                    op["draws"] += 1
                else:
                    op["losses_a"] += 1
                key2 = (b, a)
                op2 = opponent_stats[key2]
                op2["against"] += 1
                if score_b > score_a:
                    op2["wins_a"] += 1
                elif score_a == score_b:
                    op2["draws"] += 1
                else:
                    op2["losses_a"] += 1

    result: Dict[str, Any] = {}
    all_players = set(played.keys())
    for p in all_players:
        pl = played[p] or 1
        gs = goals_scored[p]
        gc = goals_conceded[p]
        last10 = elo_change_history[p][-10:]
        last_results_str = "".join(last_results[p][-5:])
        kind, count = current_streak[p]
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
            "elo": round(elo[p], 1),
            "highest_elo": round(highest[p], 1),
            "lowest_elo": round(lowest[p], 1),
            "elo_change_last10": round(sum(last10), 1),
            "current_streak": {"kind": kind, "count": count},
            "longest_win_streak": longest_win[p],
            "longest_loss_streak": longest_loss[p],
            "last_results": last_results_str,
            "elo_history": elo_history[p],
        }

    return {
        "players": result,
        "teammate_stats": teammate_stats,
        "opponent_stats": opponent_stats,
    }


def best_duos(teammate_stats: Dict[Tuple[str, str], Dict[str, int]], min_together: int = 3, limit: int = 10) -> List[dict]:
    out = []
    for (a, b), s in teammate_stats.items():
        if s["together"] < min_together:
            continue
        wr = s["wins"] / s["together"] * 100
        out.append({"player_a": a, "player_b": b, "together": s["together"], "wins": s["wins"], "draws": s["draws"], "losses": s["losses"], "win_rate": round(wr, 1)})
    out.sort(key=lambda x: (-x["win_rate"], -x["together"]))
    return out[:limit]


def best_teammates_for(player_id: str, teammate_stats: Dict[Tuple[str, str], Dict[str, int]], min_together: int = 2, limit: int = 5) -> List[dict]:
    out = []
    for (a, b), s in teammate_stats.items():
        if player_id not in (a, b):
            continue
        if s["together"] < min_together:
            continue
        other = b if a == player_id else a
        wr = s["wins"] / s["together"] * 100
        out.append({"player_id": other, "together": s["together"], "wins": s["wins"], "draws": s["draws"], "losses": s["losses"], "win_rate": round(wr, 1)})
    out.sort(key=lambda x: (-x["win_rate"], -x["together"]))
    return out[:limit]


def worst_opponents_for(player_id: str, opponent_stats: Dict[Tuple[str, str], Dict[str, int]], min_against: int = 2, limit: int = 5) -> List[dict]:
    out = []
    for (a, b), s in opponent_stats.items():
        if a != player_id:
            continue
        if s["against"] < min_against:
            continue
        wr = s["wins_a"] / s["against"] * 100
        out.append({"player_id": b, "against": s["against"], "wins": s["wins_a"], "draws": s["draws"], "losses": s["losses_a"], "win_rate": round(wr, 1)})
    out.sort(key=lambda x: (x["win_rate"], -x["against"]))
    return out[:limit]


def generate_balanced_teams(available_player_ids: List[str], player_stats: Dict[str, Any], strategy: str = "best") -> Dict[str, Any]:
    """Generate balanced teams for 5v5 (or NvN where N = len/2).

    Strategy:
      - 'best': minimize ELO diff
      - 'competitive': maximize sum of ELOs balanced (smaller diff among top players)
      - 'random_fair': pick a balanced split with some randomness (top-10 within diff threshold)
    """
    import random

    n = len(available_player_ids)
    if n < 2 or n % 2 != 0:
        return {"error": "need an even number of players (>=2)"}
    team_size = n // 2

    def elo_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("elo", INITIAL_ELO))

    def matches_of(pid: str) -> int:
        return int(player_stats.get(pid, {}).get("matches_played", 0))

    def win_rate_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("win_rate", 50.0))

    def gd_of(pid: str) -> float:
        return float(player_stats.get(pid, {}).get("goal_diff", 0))

    all_combos = []
    ids = available_player_ids
    # full enumeration up to C(20,10) ~ 184k which is fine
    seen = set()
    for combo in combinations(range(n), team_size):
        team_a = [ids[i] for i in combo]
        team_b = [ids[i] for i in range(n) if i not in combo]
        # dedupe by frozenset
        key = (frozenset(team_a), frozenset(team_b))
        rev = (frozenset(team_b), frozenset(team_a))
        if key in seen or rev in seen:
            continue
        seen.add(key)

        avg_a = sum(elo_of(p) for p in team_a) / team_size
        avg_b = sum(elo_of(p) for p in team_b) / team_size
        wr_a = sum(win_rate_of(p) for p in team_a) / team_size
        wr_b = sum(win_rate_of(p) for p in team_b) / team_size
        gd_a = sum(gd_of(p) for p in team_a)
        gd_b = sum(gd_of(p) for p in team_b)
        mp_a = sum(matches_of(p) for p in team_a)
        mp_b = sum(matches_of(p) for p in team_b)

        elo_diff = abs(avg_a - avg_b)
        wr_diff = abs(wr_a - wr_b)
        gd_diff = abs(gd_a - gd_b)
        mp_diff = abs(mp_a - mp_b)

        score = elo_diff + wr_diff * 0.5 + gd_diff * 0.2 + mp_diff * 0.1
        all_combos.append({
            "team_a": team_a, "team_b": team_b,
            "avg_a": round(avg_a, 1), "avg_b": round(avg_b, 1),
            "elo_diff": round(elo_diff, 1),
            "wr_diff": round(wr_diff, 1),
            "gd_diff": gd_diff,
            "mp_diff": mp_diff,
            "score": round(score, 2),
        })

    if not all_combos:
        return {"error": "no combinations"}

    if strategy == "best":
        all_combos.sort(key=lambda x: x["score"])
        pick = all_combos[0]
    elif strategy == "competitive":
        # maximize sum of avgs while balance is good (top 20% by elo sum among lowest diff)
        all_combos.sort(key=lambda x: (x["elo_diff"], -(x["avg_a"] + x["avg_b"])))
        pick = all_combos[0]
    elif strategy == "random_fair":
        all_combos.sort(key=lambda x: x["score"])
        top = all_combos[: max(10, len(all_combos) // 20)]
        pick = random.choice(top)
    else:
        all_combos.sort(key=lambda x: x["score"])
        pick = all_combos[0]

    # Balance percentage: 100% when elo_diff=0, decreasing
    max_diff_ref = 200.0  # 200 ELO gap = 0%
    balance_pct = max(0.0, min(100.0, 100.0 - (pick["elo_diff"] / max_diff_ref) * 100.0))

    # Predicted strength: expected win prob of team A in ELO terms
    exp_a = _expected(pick["avg_a"], pick["avg_b"])
    return {
        "strategy": strategy,
        "team_a": pick["team_a"],
        "team_b": pick["team_b"],
        "avg_elo_a": pick["avg_a"],
        "avg_elo_b": pick["avg_b"],
        "elo_diff": pick["elo_diff"],
        "win_rate_diff": pick["wr_diff"],
        "goal_diff_diff": pick["gd_diff"],
        "matches_played_diff": pick["mp_diff"],
        "balance_pct": round(balance_pct, 1),
        "predicted_win_prob_a": round(exp_a * 100, 1),
    }
