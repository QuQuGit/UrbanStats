import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { Pencil, Trash2, PlusCircle } from "lucide-react";

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([api.get("/matches"), api.get("/players")]);
      setMatches(m.data);
      setPlayers(p.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const playersById = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const remove = async (m) => {
    if (!window.confirm(`Supprimer le match du ${m.date} ?`)) return;
    try {
      await api.delete(`/matches/${m.id}`);
      toast.success("Match supprimé");
      await load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filtered = useMemo(() => {
    if (!filter) return matches;
    const f = filter.toLowerCase();
    return matches.filter((m) => {
      const names = [...m.team_a, ...m.team_b].map((id) => playersById[id]?.name || "").join(" ").toLowerCase();
      return names.includes(f) || (m.date || "").toLowerCase().includes(f);
    });
  }, [matches, filter, playersById]);

  return (
    <div className="space-y-6" data-testid="matches-page">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-overline">History</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2">Matches</h1>
        </div>
        <Link to="/matches/new" className="btn-primary flex items-center gap-2" data-testid="new-match-btn">
          <PlusCircle size={16} /> Nouveau match
        </Link>
      </header>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrer par joueur ou date…"
        className="bg-[#111] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00] w-full sm:w-96"
        data-testid="matches-filter-input"
      />

      <div className="card-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#888]">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Team A</th>
              <th className="px-4 py-3 font-medium text-center">Score</th>
              <th className="px-4 py-3 font-medium">Team B</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-[#888]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan="5" className="px-4 py-6 text-center text-[#888]">Aucun match.</td></tr>
            ) : (
              filtered.map((m) => {
                const winner = m.score_a > m.score_b ? "A" : m.score_a < m.score_b ? "B" : "D";
                return (
                  <tr key={m.id} className="border-t border-[#222] hover:bg-[#1a1a1a]" data-testid={`matches-row-${m.id}`}>
                    <td className="px-4 py-3 font-mono text-[#aaa] whitespace-nowrap">{m.date}</td>
                    <td className={`px-4 py-3 ${winner === "A" ? "text-white" : "text-[#aaa]"}`}>
                      {m.team_a.map((id) => playersById[id]?.name || "?").join(", ")}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-lg font-bold">
                      <span className={winner === "A" ? "text-[#CCFF00]" : ""}>{m.score_a}</span>
                      <span className="text-[#444] px-1">·</span>
                      <span className={winner === "B" ? "text-[#CCFF00]" : ""}>{m.score_b}</span>
                    </td>
                    <td className={`px-4 py-3 ${winner === "B" ? "text-white" : "text-[#aaa]"}`}>
                      {m.team_b.map((id) => playersById[id]?.name || "?").join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Link to={`/matches/${m.id}/edit`} className="p-2 text-[#888] hover:text-white hover:bg-[#222] rounded" data-testid={`edit-match-${m.id}`}>
                          <Pencil size={14} />
                        </Link>
                        <button onClick={() => remove(m)} className="p-2 text-[#888] hover:text-[#FF3B30] hover:bg-[#222] rounded" data-testid={`delete-match-${m.id}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
