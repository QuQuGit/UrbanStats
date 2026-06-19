import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { X, Plus, Shuffle, History, Trash2 } from "lucide-react";

const TEAM_SIZE = 5;

export default function NextLineupEdit() {
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [teamA, setTeamA] = useState([]);
  const [teamB, setTeamB] = useState([]);
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [balancing, setBalancing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, m, n] = await Promise.all([
          api.get("/players"),
          api.get("/matches"),
          api.get("/next-lineup"),
        ]);
        setPlayers(p.data);
        setMatches(m.data);
        setTeamA(n.data.team_a || []);
        setTeamB(n.data.team_b || []);
        setDate(n.data.date || "");
        setVenue(n.data.venue || "");
      } catch (e) {
        toast.error(apiError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const usedIds = useMemo(() => new Set([...teamA, ...teamB]), [teamA, teamB]);

  const available = players
    .filter((p) => !usedIds.has(p.id))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

  const addToTeam = (team, pid) => {
    if (team === "A") {
      if (teamA.length >= TEAM_SIZE) return toast.error(`Team A pleine`);
      setTeamA([...teamA, pid]);
    } else {
      if (teamB.length >= TEAM_SIZE) return toast.error(`Team B pleine`);
      setTeamB([...teamB, pid]);
    }
  };
  const removeFromTeam = (team, pid) => {
    if (team === "A") setTeamA(teamA.filter((x) => x !== pid));
    else setTeamB(teamB.filter((x) => x !== pid));
  };

  const balanceSelection = async () => {
    const ids = [...teamA, ...teamB];
    if (ids.length < 2) return toast.error("Sélectionnez d'abord les joueurs présents");
    if (ids.length % 2 !== 0) return toast.error("Nombre pair de joueurs requis");
    setBalancing(true);
    try {
      const { data } = await api.post("/team-generator", { player_ids: ids });
      const best = data.options.find((o) => o.strategy === "best") || data.options[0];
      setTeamA(best.team_a);
      setTeamB(best.team_b);
      toast.success(`Équilibrage : ${best.balance_pct}% (Δskill ${best.skill_diff})`);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setBalancing(false);
    }
  };

  const loadLastMatch = () => {
    const last = matches[0];
    if (!last) return toast.error("Aucun match précédent");
    setTeamA(last.team_a);
    setTeamB(last.team_b);
    toast.success(`Compo du ${last.date} chargée`);
  };

  const save = async () => {
    if (teamA.length === 0 && teamB.length === 0) {
      return toast.error("Ajoutez au moins une équipe");
    }
    if (teamA.length && teamB.length && teamA.length !== teamB.length) {
      return toast.error("Les équipes doivent avoir le même nombre de joueurs");
    }
    setSubmitting(true);
    try {
      await api.put("/next-lineup", {
        team_a: teamA,
        team_b: teamB,
        date: date || null,
        venue: venue || null,
      });
      toast.success("Prochaine compo enregistrée");
      navigate("/next");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Effacer la prochaine compo ?")) return;
    try {
      await api.delete("/next-lineup");
      setTeamA([]);
      setTeamB([]);
      setDate("");
      setVenue("");
      toast.success("Prochaine compo effacée");
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  if (loading) return <div className="label-overline">Loading…</div>;

  const totalSelected = teamA.length + teamB.length;

  return (
    <div className="space-y-6 fade-up" data-testid="next-edit-page">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-overline">Setup</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2">
            Composer la prochaine
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={loadLastMatch} disabled={!matches.length} className="btn-secondary flex items-center gap-2 text-sm" data-testid="edit-load-last">
            <History size={14} /> Charger dernier match
          </button>
          <button
            onClick={balanceSelection}
            disabled={balancing || totalSelected < 2 || totalSelected % 2 !== 0}
            className="btn-secondary flex items-center gap-2 text-sm"
            data-testid="edit-balance"
          >
            <Shuffle size={14} /> {balancing ? "Équilibrage…" : "Équilibrer"}
          </button>
        </div>
      </header>

      <div className="card-surface p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="label-overline mb-2">Date du match (optionnel)</div>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00]"
            data-testid="next-date-input"
          />
        </div>
        <div>
          <div className="label-overline mb-2">Lieu (optionnel)</div>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder="Ex: Stade municipal"
            className="w-full bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00]"
            data-testid="next-venue-input"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Panel letter="A" team={teamA} onRemove={(pid) => removeFromTeam("A", pid)} playersById={playersById} color="#CCFF00" />
        <Panel letter="B" team={teamB} onRemove={(pid) => removeFromTeam("B", pid)} playersById={playersById} color="#5BB0FF" />
      </div>

      <div className="card-surface p-4 sm:p-6">
        <div className="label-overline mb-3">Joueurs disponibles</div>
        <div className="flex flex-wrap gap-2">
          {available.length === 0 ? (
            <span className="text-sm text-[#666]">Tous les joueurs sont déjà placés.</span>
          ) : (
            available.map((p) => (
              <div key={p.id} className="flex gap-1">
                <button
                  onClick={() => addToTeam("A", p.id)}
                  disabled={teamA.length >= TEAM_SIZE}
                  className="text-xs px-2 py-1 rounded-l-md border border-[#222] text-white hover:bg-[#1a1a1a] disabled:opacity-40 flex items-center gap-1"
                  data-testid={`avail-add-A-${p.id}`}
                >
                  <Plus size={12} /> A
                </button>
                <span className="px-2 py-1 bg-[#0a0a0a] border-y border-[#222] text-xs flex items-center min-w-[80px]">
                  {p.name}
                </span>
                <button
                  onClick={() => addToTeam("B", p.id)}
                  disabled={teamB.length >= TEAM_SIZE}
                  className="text-xs px-2 py-1 rounded-r-md border border-[#222] text-white hover:bg-[#1a1a1a] disabled:opacity-40 flex items-center gap-1"
                  data-testid={`avail-add-B-${p.id}`}
                >
                  <Plus size={12} /> B
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button onClick={clearAll} className="btn-secondary flex items-center gap-2 text-sm text-[#FF6B5C] border-[#3a1a1a] hover:bg-[#1a0a0a]" data-testid="next-clear-btn">
          <Trash2 size={14} /> Effacer
        </button>
        <div className="flex gap-2">
          <button onClick={() => navigate("/next")} className="btn-secondary" data-testid="next-cancel-btn">Annuler</button>
          <button onClick={save} disabled={submitting} className="btn-primary" data-testid="next-save-btn">
            {submitting ? "..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Panel({ letter, team, onRemove, playersById, color }) {
  return (
    <div className="card-surface p-5" data-testid={`next-panel-${letter}`}>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <div className="label-overline" style={{ color }}>Team {letter}</div>
          <div className="font-display text-xl font-bold mt-1">{team.length}/{TEAM_SIZE}</div>
        </div>
      </div>
      <ul className="space-y-2 min-h-[200px]">
        {team.length === 0 ? (
          <li className="text-sm text-[#666] py-4 text-center">Aucun joueur. Ajoutez depuis la liste ci-dessous.</li>
        ) : (
          team.map((pid) => (
            <li key={pid} className="flex items-center justify-between bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2" data-testid={`next-team-${letter}-${pid}`}>
              <span className="text-sm">{playersById[pid]?.name || pid}</span>
              <button onClick={() => onRemove(pid)} className="p-1 text-[#888] hover:text-[#FF3B30]">
                <X size={14} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
