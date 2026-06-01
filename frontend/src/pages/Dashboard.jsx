import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { ArrowUpRight, Trophy, Target, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const [globalStats, setGlobalStats] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [g, p, m] = await Promise.all([
          api.get("/stats/global"),
          api.get("/stats/players"),
          api.get("/matches"),
        ]);
        setGlobalStats(g.data);
        setPlayers(p.data);
        setMatches(m.data);
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const playersById = useMemo(() => {
    const m = {};
    for (const p of players) m[p.player_id] = p;
    return m;
  }, [players]);

  const topWinRate = useMemo(() => {
    return [...players]
      .filter((p) => p.matches_played >= 1)
      .sort((a, b) => b.win_rate - a.win_rate || b.matches_played - a.matches_played)
      .slice(0, 10);
  }, [players]);

  const topElo = useMemo(() => {
    return [...players].sort((a, b) => b.elo - a.elo).slice(0, 10);
  }, [players]);

  const topGd = useMemo(() => {
    return [...players].sort((a, b) => b.goal_diff - a.goal_diff).slice(0, 10);
  }, [players]);

  if (loading) {
    return <div className="label-overline">Loading…</div>;
  }

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <header className="fade-up">
        <div className="label-overline">Command Center</div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black mt-2">
          Performance overview
        </h1>
      </header>

      {/* Global Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <StatBox
          label="Matches joués"
          value={globalStats?.total_matches ?? 0}
          icon={<Trophy size={18} />}
          testid="stat-total-matches"
        />
        <StatBox
          label="Buts marqués"
          value={globalStats?.total_goals ?? 0}
          icon={<Target size={18} />}
          testid="stat-total-goals"
        />
        <StatBox
          label="Joueurs actifs"
          value={`${globalStats?.active_players ?? 0} / ${globalStats?.total_players ?? 0}`}
          icon={<UsersIcon size={18} />}
          testid="stat-active-players"
        />
      </section>

      {players.length === 0 && (
        <div className="card-surface p-8 text-center">
          <div className="font-display text-2xl font-bold">Aucun joueur pour l'instant</div>
          <p className="text-[#888] mt-2">Commencez par ajouter quelques joueurs, puis saisissez un match.</p>
          <div className="mt-4 flex gap-2 justify-center">
            <Link to="/players" className="btn-primary" data-testid="empty-add-player">Ajouter joueurs</Link>
            <Link to="/matches/new" className="btn-secondary" data-testid="empty-add-match">Nouveau match</Link>
          </div>
        </div>
      )}

      {/* Rankings widgets */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <RankingCard
          title="Top 10 · Win Rate"
          column="Win%"
          rows={topWinRate.map((p) => ({ id: p.player_id, name: p.name, value: `${p.win_rate}%`, sub: `${p.matches_played} m.` }))}
          testid="ranking-winrate"
        />
        <RankingCard
          title="Top 10 · ELO"
          column="ELO"
          rows={topElo.map((p) => ({ id: p.player_id, name: p.name, value: p.elo, sub: `${p.matches_played} m.` }))}
          testid="ranking-elo"
        />
        <RankingCard
          title="Top 10 · Goal Diff"
          column="GD"
          rows={topGd.map((p) => ({ id: p.player_id, name: p.name, value: signed(p.goal_diff), sub: `${p.matches_played} m.` }))}
          testid="ranking-gd"
        />
      </section>

      {/* Recent matches */}
      <section className="card-surface p-6" data-testid="recent-matches">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-overline">Recent</div>
            <h2 className="font-display text-2xl tracking-tight font-bold">20 derniers matches</h2>
          </div>
          <Link to="/matches" className="text-sm text-[#CCFF00] hover:underline flex items-center gap-1" data-testid="see-all-matches">
            Voir tout <ArrowUpRight size={14} />
          </Link>
        </div>
        {matches.length === 0 ? (
          <div className="text-[#888] text-sm">Aucun match enregistré.</div>
        ) : (
          <ul className="divide-y divide-[#222]">
            {matches.slice(0, 20).map((m) => (
              <MatchRow key={m.id} m={m} playersById={playersById} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function signed(n) {
  if (n > 0) return `+${n}`;
  return `${n}`;
}

function StatBox({ label, value, icon, testid }) {
  return (
    <div className="card-surface p-6 fade-up" data-testid={testid}>
      <div className="flex items-center justify-between">
        <div className="label-overline">{label}</div>
        <div className="text-[#555]">{icon}</div>
      </div>
      <div className="font-mono text-4xl sm:text-5xl font-bold mt-3">{value}</div>
    </div>
  );
}

function RankingCard({ title, column, rows, testid }) {
  return (
    <div className="card-surface p-6 fade-up" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="label-overline">Ranking</div>
          <h3 className="font-display text-xl font-semibold tracking-tight">{title}</h3>
        </div>
        <div className="label-overline">{column}</div>
      </div>
      {rows.length === 0 ? (
        <div className="text-[#888] text-sm">Aucune donnée.</div>
      ) : (
        <ul className="space-y-1">
          {rows.map((r, idx) => (
            <li key={r.id}>
              <Link
                to={`/player/${r.id}`}
                className="flex items-center justify-between py-2 px-2 -mx-2 rounded hover:bg-[#1a1a1a] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-[#666] w-5 text-right">{idx + 1}</span>
                  <span className="truncate">{r.name}</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-[#666]">{r.sub}</span>
                  <span className="font-mono font-bold">{r.value}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchRow({ m, playersById }) {
  const winner =
    m.score_a > m.score_b ? "A" : m.score_a < m.score_b ? "B" : "D";
  return (
    <li className="py-3 flex items-center gap-4" data-testid={`match-row-${m.id}`}>
      <div className="w-20 text-xs text-[#888] font-mono">{m.date}</div>
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-2 ${winner === "A" ? "text-white" : "text-[#888]"}`}>
          <span className="truncate text-sm">{m.team_a.map((id) => playersById[id]?.name || "?").join(", ")}</span>
        </div>
        <div className={`flex items-center gap-2 ${winner === "B" ? "text-white" : "text-[#888]"}`}>
          <span className="truncate text-sm">{m.team_b.map((id) => playersById[id]?.name || "?").join(", ")}</span>
        </div>
      </div>
      <div className="font-mono text-xl font-bold tabular-nums">
        <span className={winner === "A" ? "text-[#CCFF00]" : ""}>{m.score_a}</span>
        <span className="text-[#444] px-1">·</span>
        <span className={winner === "B" ? "text-[#CCFF00]" : ""}>{m.score_b}</span>
      </div>
    </li>
  );
}
