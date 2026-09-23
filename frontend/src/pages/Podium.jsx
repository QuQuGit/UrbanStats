import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Trophy, Target, TrendingUp, Award, Calendar } from "lucide-react";

const CATEGORIES = [
  { key: "win_rate", label: "Win Rate", unit: "%", icon: Trophy, color: "#CCFF00" },
  { key: "points", label: "Points", unit: "pts", icon: Award, color: "#FFD60A" },
  { key: "goal_diff", label: "Goal Diff", unit: "", icon: Target, color: "#FF9500" },
  { key: "trueskill_change", label: "Progression Skill", unit: "", icon: TrendingUp, color: "#5BB0FF" },
];

const MEDALS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["#FFD60A", "#C0C0C0", "#CD7F32"];

export default function Podium() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/stats/podium?days=${days}`);
        setData(data);
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [days]);

  return (
    <div className="space-y-6" data-testid="podium-page">
      <header className="flex items-end justify-between gap-4 flex-wrap fade-up">
        <div>
          <div className="label-overline text-[#FFD60A]">Hall of Fame</div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black mt-2">
            Podium du mois
          </h1>
          <p className="text-[#888] mt-2 max-w-2xl">
            Les meilleurs joueurs sur les {days} derniers jours glissants. Minimum 2 matches pour être éligible.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-3 py-1">
          <Calendar size={14} className="text-[#888]" />
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-transparent text-sm focus:outline-none cursor-pointer"
            data-testid="podium-days-select"
          >
            <option value={7}>7 jours</option>
            <option value={14}>14 jours</option>
            <option value={30}>30 jours</option>
            <option value={60}>60 jours</option>
            <option value={90}>90 jours</option>
          </select>
        </div>
      </header>

      {data?.period_start && (
        <div className="text-xs text-[#666] font-mono">
          Période : {data.period_start} → {data.period_end} · {data.matches_count} matches · {data.eligible_count} éligibles
        </div>
      )}

      {loading ? (
        <div className="label-overline">Loading…</div>
      ) : !data || data.matches_count === 0 ? (
        <div className="card-surface p-8 text-center fade-up">
          <Trophy size={28} className="mx-auto text-[#444]" />
          <div className="font-display text-2xl font-bold mt-3">Pas de matches sur cette période</div>
          <p className="text-[#888] mt-2">Enregistrez des matches pour voir apparaître le podium.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {CATEGORIES.map((cat) => (
            <PodiumCard key={cat.key} category={cat} rows={data.podiums[cat.key] || []} />
          ))}
        </div>
      )}
    </div>
  );
}

function PodiumCard({ category, rows }) {
  const Icon = category.icon;
  return (
    <div className="card-surface p-5 fade-up" data-testid={`podium-${category.key}`}>
      <div className="flex items-center gap-3 mb-4">
        <div
          className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
          style={{ background: `${category.color}22`, color: category.color }}
        >
          <Icon size={18} />
        </div>
        <div>
          <div className="label-overline">Ranking</div>
          <h3 className="font-display text-xl font-bold tracking-tight">{category.label}</h3>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-[#666] py-4 text-center">Pas assez de données.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, idx) => (
            <li
              key={r.player_id}
              className="flex items-center gap-3 bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5"
              data-testid={`podium-${category.key}-rank-${idx + 1}`}
            >
              <span
                className="text-2xl leading-none w-8 text-center shrink-0"
                title={`#${idx + 1}`}
              >
                {MEDALS[idx]}
              </span>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/player/${r.player_id}`}
                  className="font-semibold hover:text-[#CCFF00] truncate block"
                  style={{ color: idx === 0 ? MEDAL_COLORS[0] : "#fff" }}
                >
                  {r.name}
                </Link>
                <div className="text-xs text-[#888] font-mono">
                  {r.matches_played}M · {r.wins}V · {r.win_rate}% WR · GD {r.goal_diff > 0 ? "+" : ""}{r.goal_diff}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-xl font-black" style={{ color: category.color }}>
                  {category.key === "trueskill_change" && r[category.key] > 0 ? "+" : ""}
                  {typeof r[category.key] === "number" ? r[category.key].toFixed(category.key === "trueskill_change" ? 2 : 0) : r[category.key]}
                  <span className="text-xs text-[#666] ml-0.5">{category.unit}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
