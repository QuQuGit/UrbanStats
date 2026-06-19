import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Check, X } from "lucide-react";

export default function Players() {
  const { isAdmin } = useAuth();
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [sortBy, setSortBy] = useState("name");

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([api.get("/players"), api.get("/stats/players")]);
      setPlayers(p.data);
      setStats(s.data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const statsById = useMemo(() => Object.fromEntries(stats.map((s) => [s.player_id, s])), [stats]);

  const addPlayer = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      await api.post("/players", { name });
      setNewName("");
      toast.success(`Joueur "${name}" ajouté`);
      await load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const toggleActive = async (p) => {
    try {
      await api.patch(`/players/${p.id}`, { active: !p.active });
      await load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const saveEdit = async (p) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await api.patch(`/players/${p.id}`, { name });
      setEditId(null);
      await load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const removePlayer = async (p) => {
    if (!window.confirm(`Supprimer ${p.name} ?`)) return;
    try {
      await api.delete(`/players/${p.id}`);
      toast.success("Joueur supprimé");
      await load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const filtered = useMemo(() => {
    let list = players;
    if (!showInactive) list = list.filter((p) => p.active);
    if (filter) {
      const f = filter.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(f));
    }
    const enriched = list.map((p) => ({ ...p, ...(statsById[p.id] || {}) }));
    const sorters = {
      name: (a, b) => a.name.localeCompare(b.name),
      elo: (a, b) => (b.trueskill ?? 0) - (a.trueskill ?? 0),
      matches: (a, b) => (b.matches_played ?? 0) - (a.matches_played ?? 0),
      winrate: (a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0),
      gd: (a, b) => (b.goal_diff ?? 0) - (a.goal_diff ?? 0),
    };
    enriched.sort(sorters[sortBy] || sorters.name);
    return enriched;
  }, [players, statsById, filter, showInactive, sortBy]);

  return (
    <div className="space-y-6" data-testid="players-page">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="label-overline">Roster</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2">Joueurs</h1>
        </div>
        {isAdmin && (
          <form onSubmit={addPlayer} className="flex gap-2" data-testid="add-player-form">
            <input
              data-testid="new-player-name-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom du joueur"
              className="bg-[#111] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00] w-56"
            />
            <button type="submit" className="btn-primary flex items-center gap-2" data-testid="add-player-btn">
              <Plus size={16} /> Ajouter
            </button>
          </form>
        )}
      </header>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrer par nom…"
          className="bg-[#111] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00] w-64"
          data-testid="players-filter-input"
        />
        <label className="text-sm text-[#888] flex items-center gap-2">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-[#CCFF00]"
            data-testid="show-inactive-toggle"
          />
          Inclure inactifs
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-[#111] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00]"
          data-testid="players-sort-select"
        >
          <option value="name">Tri: Nom</option>
          <option value="elo">Tri: Skill</option>
          <option value="matches">Tri: Matches</option>
          <option value="winrate">Tri: Win%</option>
          <option value="gd">Tri: Goal Diff</option>
        </select>
      </div>

      <div className="card-surface overflow-x-auto" data-testid="players-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[#888]">
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">État</th>
              <th className="px-4 py-3 font-medium text-right">M.</th>
              <th className="px-4 py-3 font-medium text-right">V</th>
              <th className="px-4 py-3 font-medium text-right">N</th>
              <th className="px-4 py-3 font-medium text-right">D</th>
              <th className="px-4 py-3 font-medium text-right">Win%</th>
              <th className="px-4 py-3 font-medium text-right">GD</th>
              <th className="px-4 py-3 font-medium text-right">Skill</th>
              {isAdmin && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={isAdmin ? 10 : 9} className="px-4 py-6 text-center text-[#888]">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={isAdmin ? 10 : 9} className="px-4 py-6 text-center text-[#888]">Aucun joueur.</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="border-t border-[#222] hover:bg-[#1a1a1a]" data-testid={`player-row-${p.id}`}>
                  <td className="px-4 py-3">
                    {editId === p.id ? (
                      <div className="flex gap-1 items-center">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="bg-[#0a0a0a] border border-[#222] rounded px-2 py-1 text-sm"
                          autoFocus
                          data-testid={`edit-player-input-${p.id}`}
                        />
                        <button onClick={() => saveEdit(p)} className="p-1 text-[#CCFF00]" data-testid={`save-player-${p.id}`}><Check size={16} /></button>
                        <button onClick={() => setEditId(null)} className="p-1 text-[#888]"><X size={16} /></button>
                      </div>
                    ) : (
                      <Link to={`/player/${p.id}`} className="hover:text-[#CCFF00]">{p.name}</Link>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      <button onClick={() => toggleActive(p)} className="text-xs" data-testid={`toggle-active-${p.id}`}>
                        <span className={`px-2 py-1 rounded-full ${p.active ? "bg-[#CCFF00]/15 text-[#CCFF00]" : "bg-[#222] text-[#888]"}`}>
                          {p.active ? "actif" : "inactif"}
                        </span>
                      </button>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full ${p.active ? "bg-[#CCFF00]/15 text-[#CCFF00]" : "bg-[#222] text-[#888]"}`}>
                        {p.active ? "actif" : "inactif"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{p.matches_played ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.wins ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.draws ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono">{p.losses ?? 0}</td>
                  <td className="px-4 py-3 text-right font-mono">{(p.win_rate ?? 0)}%</td>
                  <td className={`px-4 py-3 text-right font-mono ${(p.goal_diff ?? 0) > 0 ? "text-[#CCFF00]" : (p.goal_diff ?? 0) < 0 ? "text-[#FF3B30]" : ""}`}>
                    {(p.goal_diff ?? 0) > 0 ? "+" : ""}{p.goal_diff ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold">{(p.trueskill ?? 0).toFixed(2)}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => { setEditId(p.id); setEditName(p.name); }}
                          className="p-2 text-[#888] hover:text-white hover:bg-[#222] rounded"
                          data-testid={`edit-player-${p.id}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => removePlayer(p)}
                          className="p-2 text-[#888] hover:text-[#FF3B30] hover:bg-[#222] rounded"
                          data-testid={`delete-player-${p.id}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
