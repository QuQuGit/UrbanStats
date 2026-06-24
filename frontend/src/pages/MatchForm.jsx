import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { X, Plus, Sparkles, History } from "lucide-react";

const TEAM_SIZE = 5;

export default function MatchForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, mlist] = await Promise.all([api.get("/players"), api.get("/matches")]);
        setPlayers(p.data);
        setMatches(mlist.data);
        if (isEdit) {
          const match = mlist.data.find((x) => x.id === id);
          if (!match) {
            toast.error("Match introuvable");
            navigate("/matches");
            return;
          }
          setDate(match.date);
          setTeamA(match.team_a);
          setTeamB(match.team_b);
          setScoreA(match.score_a);
          setScoreB(match.score_b);
        }
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, navigate]);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const usedIds = useMemo(() => new Set([...teamA, ...teamB]), [teamA, teamB]);

  const availableForTeam = () => {
    return players
      .filter((p) => !usedIds.has(p.id))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  };

  const addToTeam = (team, pid) => {
    if (team === "A") {
      if (teamA.length >= TEAM_SIZE) return toast.error(`Team A pleine (${TEAM_SIZE} joueurs)`);
      setTeamA([...teamA, pid]);
    } else {
      if (teamB.length >= TEAM_SIZE) return toast.error(`Team B pleine (${TEAM_SIZE} joueurs)`);
      setTeamB([...teamB, pid]);
    }
  };

  const removeFromTeam = (team, pid) => {
    if (team === "A") setTeamA(teamA.filter((x) => x !== pid));
    else setTeamB(teamB.filter((x) => x !== pid));
  };

  // Action: charger la "Prochaine compo" actuellement définie
  const loadNextLineup = async () => {
    setLoadingNext(true);
    try {
      const { data } = await api.get("/next-lineup");
      const a = data.team_a || [];
      const b = data.team_b || [];
      if (a.length === 0 && b.length === 0) {
        return toast.error("Aucune prochaine compo définie");
      }
      setTeamA(a);
      setTeamB(b);
      toast.success("Prochaine compo chargée");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoadingNext(false);
    }
  };

  // Action: charger la composition du dernier match enregistré
  const loadLastMatch = () => {
    const last = matches[0]; // matches sorted desc by date in backend
    if (!last) return toast.error("Aucun match précédent");
    setTeamA(last.team_a);
    setTeamB(last.team_b);
    toast.success(`Compo du ${last.date} chargée`);
  };

  const submit = async () => {
    if (teamA.length === 0 || teamB.length === 0) return toast.error("Les deux équipes doivent contenir des joueurs");
    if (teamA.length !== teamB.length) return toast.error("Les équipes doivent contenir le même nombre de joueurs");
    if (!date) return toast.error("Date requise");
    setSubmitting(true);
    try {
      const payload = { date, team_a: teamA, team_b: teamB, score_a: Number(scoreA), score_b: Number(scoreB) };
      if (isEdit) {
        await api.patch(`/matches/${id}`, payload);
        toast.success("Match mis à jour");
      } else {
        await api.post("/matches", payload);
        toast.success("Match enregistré");
      }
      navigate("/matches");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="label-overline">Loading…</div>;

  return (
    <div className="space-y-6 fade-up" data-testid="match-form-page">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-overline">{isEdit ? "Edit" : "Entry"}</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2">
            {isEdit ? "Éditer le match" : "Nouveau match"}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadLastMatch}
            disabled={matches.length === 0}
            className="btn-secondary flex items-center gap-2 text-sm"
            data-testid="load-last-match-btn"
          >
            <History size={14} /> Charger dernier match
          </button>
          <button
            type="button"
            onClick={loadNextLineup}
            disabled={loadingNext}
            className="btn-secondary flex items-center gap-2 text-sm"
            data-testid="load-next-lineup-btn"
          >
            <Sparkles size={14} /> {loadingNext ? "Chargement…" : "Prochaine compo"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <TeamPanel
          letter="A"
          team={teamA}
          available={availableForTeam()}
          playersById={playersById}
          score={scoreA}
          setScore={setScoreA}
          onAdd={(pid) => addToTeam("A", pid)}
          onRemove={(pid) => removeFromTeam("A", pid)}
          color="#CCFF00"
        />
        <TeamPanel
          letter="B"
          team={teamB}
          available={availableForTeam()}
          playersById={playersById}
          score={scoreB}
          setScore={setScoreB}
          onAdd={(pid) => addToTeam("B", pid)}
          onRemove={(pid) => removeFromTeam("B", pid)}
          color="#007AFF"
        />
      </div>

      <div className="card-surface p-6 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <div className="label-overline mb-2">Date</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00] w-full"
            data-testid="match-date-input"
          />
        </div>
        <div className="text-center">
          <div className="label-overline mb-2">Résumé</div>
          <div className="font-mono text-2xl font-bold">
            <span className={scoreA > scoreB ? "text-[#CCFF00]" : ""}>{scoreA}</span>
            <span className="text-[#444] px-2">·</span>
            <span className={scoreB > scoreA ? "text-[#CCFF00]" : ""}>{scoreB}</span>
          </div>
          <div className="text-xs text-[#888] mt-1">{teamA.length} vs {teamB.length}</div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => navigate(-1)} className="btn-secondary" data-testid="cancel-match-btn">Annuler</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="btn-primary"
            data-testid="submit-match-btn"
          >
            {submitting ? "..." : isEdit ? "Mettre à jour" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamPanel({ letter, team, available, playersById, score, setScore, onAdd, onRemove, color }) {
  return (
    <div className="card-surface p-6" data-testid={`team-panel-${letter}`}>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="label-overline" style={{ color }}>Team {letter}</div>
          <h2 className="font-display text-2xl tracking-tight font-bold mt-1">{team.length}/{TEAM_SIZE} joueurs</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScore(Math.max(0, Number(score) - 1))}
            className="btn-secondary py-1 px-3"
            data-testid={`score-${letter}-minus`}
          >–</button>
          <input
            type="number"
            value={score}
            min={0}
            onChange={(e) => setScore(Math.max(0, Number(e.target.value) || 0))}
            className="bg-[#0a0a0a] border border-[#222] rounded-md px-2 py-1 text-2xl font-mono font-bold w-16 text-center focus:outline-none focus:border-[#CCFF00]"
            data-testid={`score-${letter}-input`}
          />
          <button
            onClick={() => setScore(Number(score) + 1)}
            className="btn-secondary py-1 px-3"
            data-testid={`score-${letter}-plus`}
          >+</button>
        </div>
      </div>

      <ul className="space-y-2 mb-4 min-h-[180px]">
        {team.length === 0 && <li className="text-sm text-[#666]">Aucun joueur sélectionné.</li>}
        {team.map((pid) => (
          <li key={pid} className="flex items-center justify-between bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2" data-testid={`team-${letter}-player-${pid}`}>
            <span className="text-sm">{playersById[pid]?.name || pid}</span>
            <button onClick={() => onRemove(pid)} className="p-1 text-[#888] hover:text-[#FF3B30]" data-testid={`remove-${letter}-${pid}`}>
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <div className="label-overline mb-2">Disponibles</div>
      <div className="flex flex-wrap gap-2 max-h-48 overflow-auto">
        {available.length === 0 ? (
          <span className="text-sm text-[#666]">Aucun joueur disponible.</span>
        ) : available.map((p) => (
          <button
            key={p.id}
            onClick={() => onAdd(p.id)}
            disabled={team.length >= TEAM_SIZE}
            className={`text-xs px-2 py-1 rounded-md border transition-colors ${p.active ? "border-[#222] text-white hover:bg-[#1a1a1a]" : "border-[#222] text-[#666] hover:text-white hover:bg-[#1a1a1a]"} disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1`}
            data-testid={`add-${letter}-${p.id}`}
          >
            <Plus size={12} /> {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
