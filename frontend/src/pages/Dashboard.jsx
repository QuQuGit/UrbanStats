import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { ArrowUpRight, Trophy, Target, Users as UsersIcon, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

const COLUMNS = [
  { key: "rank", label: "#", className: "w-10 text-center", sortable: false },
  { key: "name", label: "Joueur", className: "" },
  { key: "matches_played", label: "M", className: "text-right w-12" },
  { key: "wins", label: "V", className: "text-right w-12" },
  { key: "draws", label: "N", className: "text-right w-12" },
  { key: "losses", label: "D", className: "text-right w-12" },
  { key: "win_rate", label: "Win%", className: "text-right w-16" },
  { key: "goal_diff", label: "GD", className: "text-right w-14" },
  { key: "points", label: "Pts", className: "text-right w-14" },
  { key: "trueskill", label: "Skill", className: "text-right w-20" },
];

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [globalStats, setGlobalStats] = useState(null);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: "trueskill", dir: -1 });

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

  const ranked = useMemo(() => {
    const arr = [...players];
    arr.sort((a, b) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      if (typeof av === "string") return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });
    return arr;
  }, [players, sort]);

  const toggleSort = (key) => {
    if (key === "rank") return;
    setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: key === "name" ? 1 : -1 }));
  };

  if (loading) return <div className="label-overline">Loading…</div>;

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <header className="fade-up">
        <div className="label-overline">Command Center</div>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black mt-2">
          Performance overview
        </h1>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <StatBox label="Matches joués" value={globalStats?.total_matches ?? 0} icon={<Trophy size={18} />} testid="stat-total-matches" />
        <StatBox label="Buts marqués" value={globalStats?.total_goals ?? 0} icon={<Target size={18} />} testid="stat-total-goals" />
        <StatBox label="Joueurs actifs" value={`${globalStats?.active_players ?? 0} / ${globalStats?.total_players ?? 0}`} icon={<UsersIcon size={18} />} testid="stat-active-players" />
      </section>

      {players.length === 0 ? (
        <div className="card-surface p-8 text-center">
          <div className="font-display text-2xl font-bold">Aucun joueur pour l'instant</div>
          <p className="text-[#888] mt-2">
            {isAdmin ? "Ajoutez des joueurs puis saisissez un match." : "L'admin n'a pas encore ajouté de joueurs."}
          </p>
          {isAdmin && (
            <div className="mt-4 flex gap-2 justify-center">
              <Link to="/players" className="btn-primary" data-testid="empty-add-player">Ajouter joueurs</Link>
              <Link to="/matches/new" className="btn-secondary" data-testid="empty-add-match">Nouveau match</Link>
            </div>
          )}
        </div>
      ) : (
        <section className="card-surface p-6 fade-up" data-testid="ranking-table">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="label-overline">Ranking</div>
              <h2 className="font-display text-2xl tracking-tight font-bold">Classement complet · TrueSkill</h2>
            </div>
            <div className="text-xs text-[#666]">
              {ranked.length} joueur{ranked.length > 1 ? "s" : ""} · tri par&nbsp;
              <span className="text-white">{COLUMNS.find((c) => c.key === sort.key)?.label || sort.key}</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#888]">
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2 font-medium ${c.className} ${c.sortable === false ? "" : "cursor-pointer hover:text-white select-none"}`}
                      onClick={() => toggleSort(c.key)}
                      data-testid={`sort-${c.key}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sort.key === c.key && (sort.dir === 1 ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranked.map((p, idx) => (
                  <tr key={p.player_id} className="border-t border-[#222] hover:bg-[#1a1a1a]" data-testid={`rank-row-${p.player_id}`}>
                    <td className="px-3 py-2 text-center font-mono text-xs text-[#888]">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <Link to={`/player/${p.player_id}`} className="hover:text-[#CCFF00] flex items-center gap-2">
                        <span className={`h-1.5 w-1.5 rounded-full ${p.active ? "bg-[#CCFF00]" : "bg-[#444]"}`} />
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.matches_played}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.wins}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.draws}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.losses}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.win_rate}%</td>
                    <td className={`px-3 py-2 text-right font-mono ${p.goal_diff > 0 ? "text-[#CCFF00]" : p.goal_diff < 0 ? "text-[#FF3B30]" : ""}`}>
                      {p.goal_diff > 0 ? "+" : ""}{p.goal_diff}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{p.points}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#CCFF00]">
                      {p.trueskill?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card-surface p-6" data-testid="recent-matches">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="label-overline">Recent</div>
            <h2 className="font-display text-2xl tracking-tight font-bold">20 derniers matches</h2>
          </div>
          <Link to="/matches" className="text-sm text-[#CCFF00] hover:underline flex items-center gap-1">
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

function MatchRow({ m, playersById }) {
  const winner = m.score_a > m.score_b ? "A" : m.score_a < m.score_b ? "B" : "D";
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
