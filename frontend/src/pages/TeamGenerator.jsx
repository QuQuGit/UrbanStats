import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Shuffle, Sparkles, Save, Trash2, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "fives_gen_selection";

export default function TeamGenerator() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]); // ordered array
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingIdx, setSavingIdx] = useState(-1);

  useEffect(() => {
    (async () => {
      try {
        const [p, s] = await Promise.all([api.get("/players"), api.get("/stats/players")]);
        const statsById = Object.fromEntries(s.data.map((x) => [x.player_id, x]));
        setPlayers(p.data.map((pl) => ({ ...pl, ...(statsById[pl.id] || {}) })));
        // Restore saved selection from localStorage
        try {
          const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
          if (Array.isArray(saved) && saved.length > 0) {
            const validIds = new Set(p.data.map((x) => x.id));
            const restored = saved.filter((id) => validIds.has(id));
            if (restored.length) {
              setSelected(restored);
              toast.info(`Sélection restaurée (${restored.length} joueurs)`);
            }
          }
        } catch (_) {
          // ignore malformed storage
        }
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (pid) => {
    setSelected((cur) => (cur.includes(pid) ? cur.filter((x) => x !== pid) : [...cur, pid]));
  };

  const saveSelection = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected));
    toast.success(`Sélection sauvegardée (${selected.length} joueurs)`);
  };

  const clearSelection = () => {
    setSelected([]);
    setResults(null);
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Sélection effacée");
  };

  const setAsNext = async (opt, idx) => {
    setSavingIdx(idx);
    try {
      await api.put("/next-lineup", { team_a: opt.team_a, team_b: opt.team_b });
      toast.success("Prochaine compo mise à jour");
      navigate("/next");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingIdx(-1);
    }
  };

  const generate = async () => {
    if (selected.length < 2) return toast.error("Sélectionnez au moins 2 joueurs");
    if (selected.length % 2 !== 0) return toast.error("Nombre pair de joueurs requis");
    setSubmitting(true);
    try {
      const { data } = await api.post("/team-generator", { player_ids: selected });
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
          Sélectionnez les joueurs présents. Le système propose 3 répartitions optimisées par TrueSkill,
          win%, goal-diff et historique de coéquipiers.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="card-surface p-6">
          <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="label-overline">Disponibles</div>
              <h2 className="font-display text-xl font-semibold tracking-tight mt-1">
                {selected.length} sélectionné{selected.length > 1 ? "s" : ""}
              </h2>
            </div>
            <div className="text-xs text-[#888]">
              {selected.length % 2 === 0 ? "OK pour générer" : "Nombre impair"}
            </div>
          </div>
          {loading ? (
            <div className="text-sm text-[#888]">Loading…</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {players.filter((p) => p.active && !p.excluded).map((p) => {
                const orderIdx = selected.indexOf(p.id);
                const active = orderIdx >= 0;
                return (
                  <button
                    key={p.id}
                    onClick={() => toggle(p.id)}
                    className={`text-left px-3 py-2 rounded-md border transition-colors flex items-center justify-between gap-2 ${
                      active
                        ? "border-[#CCFF00] bg-[#CCFF00]/10 text-white"
                        : "border-[#222] text-[#aaa] hover:bg-[#1a1a1a]"
                    }`}
                    data-testid={`gen-select-${p.id}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {active && (
                        <span className="shrink-0 h-5 w-5 grid place-items-center rounded-full bg-[#CCFF00] text-black text-[10px] font-black">
                          {orderIdx + 1}
                        </span>
                      )}
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="font-mono text-xs text-[#888] shrink-0">
                      {(p.trueskill ?? 0).toFixed(1)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-surface p-6 lg:w-72 lg:sticky lg:top-24">
          <div className="label-overline mb-3">Action</div>
          <button
            onClick={generate}
            disabled={submitting || selected.length < 2 || selected.length % 2 !== 0}
            className="btn-primary w-full flex items-center justify-center gap-2"
            data-testid="generate-teams-btn"
          >
            <Shuffle size={16} /> {submitting ? "Calcul…" : "Générer les équipes"}
          </button>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={saveSelection}
              disabled={selected.length === 0}
              className="btn-secondary text-xs flex items-center justify-center gap-1"
              data-testid="save-selection-btn"
            >
              <Save size={12} /> Sauver
            </button>
            <button
              onClick={clearSelection}
              disabled={selected.length === 0 && !results}
              className="btn-secondary text-xs flex items-center justify-center gap-1"
              data-testid="clear-selection-btn"
            >
              <Trash2 size={12} /> Vider
            </button>
          </div>
          <div className="mt-4 pt-4 border-t border-[#222] text-xs text-[#666] flex items-start gap-2">
            <RotateCcw size={12} className="mt-0.5" />
            <span>La sélection sauvegardée se recharge automatiquement au retour sur la page.</span>
          </div>
        </div>
      </div>

      {results?.options && (
        <section className="space-y-4">
          <div className="label-overline">Suggestions</div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            {results.options.map((opt, idx) => (
              <OptionCard
                key={idx}
                opt={opt}
                idx={idx}
                playersById={playersById}
                isAdmin={isAdmin}
                onSetAsNext={() => setAsNext(opt, idx)}
                saving={savingIdx === idx}
              />
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
  least_together: { title: "Moins joué ensemble", subtitle: "Fraîcheur des duos" },
};

function OptionCard({ opt, idx, playersById, isAdmin, onSetAsNext, saving }) {
  const meta = STRATEGY_LABELS[opt.strategy] || { title: opt.strategy, subtitle: "" };
  const balance = opt.balance_pct ?? 0;
  const balanceColor = balance >= 90 ? "#CCFF00" : balance >= 75 ? "#FF9500" : "#FF3B30";
  return (
    <div className="card-surface p-6 fade-up flex flex-col" data-testid={`gen-option-${opt.strategy}`}>
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
        <Tag k="Fois joués ens." v={opt.together_total ?? "?"} />
        <Tag k="P(A win)" v={`${opt.predicted_win_prob_a}%`} />
      </div>
      {isAdmin && (
        <button
          onClick={onSetAsNext}
          disabled={saving}
          className="mt-4 btn-primary w-full flex items-center justify-center gap-2 text-sm"
          data-testid={`set-as-next-${opt.strategy}`}
        >
          <Sparkles size={14} /> {saving ? "Mise à jour…" : "Définir comme prochaine compo"}
        </button>
      )}
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
