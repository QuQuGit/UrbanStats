import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function PlayerProfile() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [players, setPlayers] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [d, p] = await Promise.all([api.get(`/stats/player/${id}`), api.get("/players")]);
        setData(d.data);
        setPlayers(Object.fromEntries(p.data.map((x) => [x.id, x])));
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <div className="label-overline">Loading…</div>;
  if (!data) return <div className="text-[#888]">Joueur introuvable.</div>;

  const { player, stats, best_teammates, tough_opponents, matches } = data;

  const eloSeries = (stats.trueskill_history || []).map((h, idx) => ({
    idx: idx + 1,
    date: h.date,
    skill: h.skill,
  }));

  const streakLabel = (() => {
    const s = stats.current_streak;
    if (!s || !s.count) return "—";
    const word = s.kind === "W" ? "victoires" : s.kind === "L" ? "défaites" : "nuls";
    return `${s.count} ${word}`;
  })();

  return (
    <div className="space-y-6" data-testid="player-profile-page">
      <Link to="/players" className="text-sm text-[#888] hover:text-white flex items-center gap-1 w-fit" data-testid="profile-back">
        <ArrowLeft size={14} /> Retour à la liste
      </Link>

      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-overline">Player</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black mt-2">{player.name}</h1>
          <div className="text-[#888] text-sm mt-1">{player.active ? "Actif" : "Inactif"}</div>
        </div>
        <div className="text-right">
          <div className="label-overline">TrueSkill</div>
          <div className="font-mono text-5xl font-bold text-[#CCFF00]">{(stats.trueskill ?? 0).toFixed(2)}</div>
          <div className="text-xs text-[#888]">
            μ {stats.mu ?? "—"} · σ {stats.sigma ?? "—"} · Max {stats.highest_trueskill} · Min {stats.lowest_trueskill}
          </div>
        </div>
      </header>

      {/* Summary stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <Cell label="Matches" value={stats.matches_played} />
        <Cell label="V" value={stats.wins} accent="#CCFF00" />
        <Cell label="N" value={stats.draws} />
        <Cell label="D" value={stats.losses} accent="#FF3B30" />
        <Cell label="Win%" value={`${stats.win_rate}%`} />
        <Cell label="Points" value={stats.points} />
        <Cell label="Buts +" value={stats.goals_scored} />
        <Cell label="Buts -" value={stats.goals_conceded} />
        <Cell label="GD" value={(stats.goal_diff > 0 ? "+" : "") + stats.goal_diff} accent={stats.goal_diff > 0 ? "#CCFF00" : stats.goal_diff < 0 ? "#FF3B30" : null} />
        <Cell label="Moy +" value={stats.avg_goals_scored} />
        <Cell label="Moy -" value={stats.avg_goals_conceded} />
        <Cell label="Streak" value={streakLabel} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="card-surface p-6 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-overline">Progression</div>
              <h2 className="font-display text-2xl tracking-tight font-bold">TrueSkill au fil du temps</h2>
            </div>
            <div className="text-xs text-[#888] flex items-center gap-2">
              {(stats.trueskill_change_last10 ?? 0) >= 0 ? (
                <span className="text-[#CCFF00] flex items-center gap-1"><TrendingUp size={14} /> +{stats.trueskill_change_last10}</span>
              ) : (
                <span className="text-[#FF3B30] flex items-center gap-1"><TrendingDown size={14} /> {stats.trueskill_change_last10}</span>
              )}
              · 10 derniers
            </div>
          </div>
          {eloSeries.length === 0 ? (
            <div className="text-sm text-[#666]">Pas encore de matches.</div>
          ) : (
            <div className="h-64" data-testid="trueskill-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={eloSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                  <XAxis dataKey="idx" stroke="#555" tick={{ fill: "#888", fontSize: 11 }} />
                  <YAxis stroke="#555" tick={{ fill: "#888", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 6, color: "#fff" }}
                    labelFormatter={(v) => `Match #${v}`}
                  />
                  <Line type="monotone" dataKey="skill" stroke="#007AFF" strokeWidth={2} dot={false} animationDuration={500} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card-surface p-6">
          <div className="label-overline">Forme</div>
          <h2 className="font-display text-2xl tracking-tight font-bold mt-1">5 derniers</h2>
          <div className="mt-4 flex gap-2">
            {stats.last_results.length === 0 ? (
              <span className="text-sm text-[#666]">—</span>
            ) : (
              stats.last_results.split("").map((r, i) => (
                <span
                  key={i}
                  className={`h-9 w-9 grid place-items-center rounded font-mono font-bold ${
                    r === "W" ? "bg-[#CCFF00] text-black" : r === "L" ? "bg-[#FF3B30] text-white" : "bg-[#222] text-white"
                  }`}
                >{r}</span>
              ))
            )}
          </div>
          <div className="mt-6 space-y-2 text-sm">
            <Row k="Plus longue série victoire" v={stats.longest_win_streak} />
            <Row k="Plus longue série défaite" v={stats.longest_loss_streak} />
            <Row k="Skill max" v={stats.highest_trueskill} />
            <Row k="Skill min" v={stats.lowest_trueskill} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <div className="card-surface p-6">
          <div className="label-overline">Synergy</div>
          <h2 className="font-display text-2xl tracking-tight font-bold">Meilleurs coéquipiers</h2>
          <ul className="mt-4 space-y-1">
            {best_teammates.length === 0 ? <li className="text-sm text-[#666]">Pas encore de données.</li> : best_teammates.map((t) => (
              <li key={t.player_id} className="flex items-center justify-between py-2 border-b border-[#222]">
                <Link to={`/player/${t.player_id}`} className="hover:text-[#CCFF00]">{t.name}</Link>
                <div className="text-xs text-[#888] font-mono">{t.together} matches · <span className="text-white font-bold">{t.win_rate}%</span></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="card-surface p-6">
          <div className="label-overline">Nemesis</div>
          <h2 className="font-display text-2xl tracking-tight font-bold">Adversaires difficiles</h2>
          <ul className="mt-4 space-y-1">
            {tough_opponents.length === 0 ? <li className="text-sm text-[#666]">Pas encore de données.</li> : tough_opponents.map((t) => (
              <li key={t.player_id} className="flex items-center justify-between py-2 border-b border-[#222]">
                <Link to={`/player/${t.player_id}`} className="hover:text-[#CCFF00]">{t.name}</Link>
                <div className="text-xs text-[#888] font-mono">{t.against} matches · <span className="text-white font-bold">{t.win_rate}%</span></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card-surface p-6">
        <div className="label-overline">History</div>
        <h2 className="font-display text-2xl tracking-tight font-bold">Matches du joueur</h2>
        {matches.length === 0 ? (
          <div className="text-sm text-[#666] mt-3">Aucun match.</div>
        ) : (
          <ul className="mt-4 divide-y divide-[#222]">
            {matches.map((m) => {
              const inA = m.team_a.includes(id);
              const own = inA ? m.score_a : m.score_b;
              const opp = inA ? m.score_b : m.score_a;
              const res = own > opp ? "V" : own < opp ? "D" : "N";
              const color = res === "V" ? "#CCFF00" : res === "D" ? "#FF3B30" : "#888";
              return (
                <li key={m.id} className="py-3 flex items-center gap-4">
                  <span className="font-mono text-xs text-[#888] w-20">{m.date}</span>
                  <span className="font-mono font-bold w-8 text-center" style={{ color }}>{res}</span>
                  <span className="font-mono text-lg font-bold">{own} · {opp}</span>
                  <span className="text-[#888] text-sm truncate">
                    vs {(inA ? m.team_b : m.team_a).map((pid) => players[pid]?.name || "?").join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Cell({ label, value, accent }) {
  return (
    <div className="card-surface p-4">
      <div className="label-overline">{label}</div>
      <div className="font-mono text-2xl font-bold mt-1" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex justify-between text-[#aaa]">
      <span>{k}</span>
      <span className="font-mono font-bold text-white">{v}</span>
    </div>
  );
}
