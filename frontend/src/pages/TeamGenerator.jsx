import { useEffect, useMemo, useState } from "react";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Shuffle } from "lucide-react";

export default function TeamGenerator() {
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([api.get("/players"), api.get("/stats/players")]);
        const statsById = Object.fromEntries(s.data.map((x) => [x.player_id, x]));
        setPlayers(p.data.map((pl) => ({ ...pl, ...(statsById[pl.id] || {}) })));
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const toggle = (pid) => {
    const next = new Set(selected);
    next.has(pid) ? next.delete(pid) : next.add(pid);
    setSelected(next);
  };

  const generate = async () => {
    const ids = [...selected];
    if (ids.length < 2) return toast.error("Sélectionnez au moins 2 joueurs");
    if (ids.length % 2 !== 0) return toast.error("Nombre pair de joueurs requis");
    setSubmitting(true);
    try {
      const { data } = await api.post("/team-generator", { player_ids: ids });
      setResults(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="generator-page">
      <header>
        <div className="label-overline">Tactical</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2">Générateur d'équipes</h1>
        <p className="text-[#888] mt-2 max-w-2xl">
          Sélectionnez les joueurs présents. Le système propose 3 répartitions optimisées par ELO,
          win%, goal-diff et matches joués.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="card-surface p-6">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="label-overline">Disponibles</div>
              <h2 className="font-display text-xl font-semibold tracking-tight mt-1">
                {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
              </h2>
            </div>
            <div className="text-xs text-[#888]">
              {selected.size % 2 === 0 ? "OK pour générer" : "Nombre impair"}
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-[#888]">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {players.filter((p) => p.active).map((p) => {
                const active = selected.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`text-left px-3 py-2 rounded-md border transition-colors flex items-center justify-between ${active ? "border-[#CCFF00] bg-[#CCFF00]/10 text-white" : "border-[#222] text-[#aaa] hover:bg-[#1a1a1a]"}`}
                    data-testid={`gen-select-${p.id}`}
                  >
                    <span>{p.name}</span>
                    <span className="font-mono text-xs text-[#888]">{(p.trueskill ?? 0).toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-surface p-6 lg:w-72 sticky top-24">
          <div className="label-overline mb-3">Action</div>
          <button
            onClick={generate}
            disabled={submitting || selected.size < 2 || selected.size % 2 !== 0}
            className="btn-primary w-full flex items-center justify-center gap-2"
            data-testid="generate-teams-btn"
          >
            <Shuffle size={16} /> {submitting ? "Calcul…" : "Générer les équipes"}
          </button>
          <button
            onClick={() => { setSelected(new Set()); setResults(null); }}
            className="btn-secondary w-full mt-2 text-sm"
            data-testid="generator-clear-btn"
          >
            Effacer
          </button>
        </div>
      </div>

      {results?.options && (
        <section className="space-y-4">
          <div className="label-overline">Suggestions</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {results.options.map((opt, idx) => (
              <OptionCard key={idx} opt={opt} idx={idx} playersById={playersById} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const STRATEGY_LABELS = {
  best: { title: "Meilleur équilibre", subtitle: "Skill le plus serré" },
  competitive: { title: "Plus compétitif", subtitle: "Niveaux Skill max" },
  random_fair: { title: "Aléatoire équitable", subtitle: "Variation équilibrée" },
};

function OptionCard({ opt, idx, playersById }) {
  const meta = STRATEGY_LABELS[opt.strategy] || { title: opt.strategy, subtitle: "" };
  const balance = opt.balance_pct ?? 0;
  const balanceColor = balance >= 90 ? "#CCFF00" : balance >= 75 ? "#FF9500" : "#FF3B30";
  return (
    <div className="card-surface p-6 fade-up" data-testid={`gen-option-${opt.strategy}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="label-overline">Option {idx + 1}</div>
          <h3 className="font-display text-xl font-semibold tracking-tight">{meta.title}</h3>
          <p className="text-xs text-[#888]">{meta.subtitle}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-3xl font-bold" style={{ color: balanceColor }}>
            {balance}%
          </div>
          <div className="label-overline">Balance</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <TeamList letter="A" ids={opt.team_a} avg={opt.avg_skill_a} playersById={playersById} color="#CCFF00" />
        <TeamList letter="B" ids={opt.team_b} avg={opt.avg_skill_b} playersById={playersById} color="#007AFF" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#aaa]">
        <Tag k="ΔSkill" v={opt.skill_diff} />
        <Tag k="Δ Win%" v={`${opt.win_rate_diff}`} />
        <Tag k="Δ GD" v={opt.goal_diff_diff} />
        <Tag k="P(A win)" v={`${opt.predicted_win_prob_a}%`} />
      </div>
    </div>
  );
}

function TeamList({ letter, ids, avg, playersById, color }) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="label-overline" style={{ color }}>Team {letter}</div>
        <span className="font-mono text-xs text-[#888]">Skill {avg}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {ids.map((id) => (
          <li key={id} className="text-sm bg-[#0a0a0a] border border-[#222] px-2 py-1 rounded">
            {playersById[id]?.name || id}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ k, v }) {
  return (
    <div className="flex justify-between bg-[#0a0a0a] border border-[#222] rounded px-2 py-1">
      <span className="text-[#888]">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  );
}
