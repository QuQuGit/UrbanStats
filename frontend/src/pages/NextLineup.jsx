import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  Calendar,
  MapPin,
  Pencil,
  Share2,
  Sparkles,
  Trophy,
  Users as UsersIcon,
} from "lucide-react";

const TEAM_META = {
  A: {
    name: "TEAM A",
    color: "#CCFF00",
    text: "text-[#CCFF00]",
    bg: "bg-[#CCFF00]",
    border: "border-[#CCFF00]/30",
    softBg: "bg-[#CCFF00]/5",
    badge: "bg-[#CCFF00] text-black",
  },
  B: {
    name: "TEAM B",
    color: "#007AFF",
    text: "text-[#5BB0FF]",
    bg: "bg-[#007AFF]",
    border: "border-[#007AFF]/30",
    softBg: "bg-[#007AFF]/5",
    badge: "bg-[#007AFF] text-white",
  },
};

function initial(name) {
  return (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formColor(c) {
  if (c === "W") return "bg-[#CCFF00] text-black";
  if (c === "L") return "bg-[#FF3B30] text-white";
  return "bg-[#333] text-white";
}

export default function NextLineup() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [players, setPlayers] = useState({});
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [n, p, s] = await Promise.all([
        api.get("/next-lineup"),
        api.get("/players"),
        api.get("/stats/players"),
      ]);
      setData(n.data);
      setPlayers(Object.fromEntries(p.data.map((x) => [x.id, x])));
      setStats(Object.fromEntries(s.data.map((x) => [x.player_id, x])));
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const avgA = useMemo(() => {
    const ids = data?.team_a || [];
    if (!ids.length) return 0;
    return ids.reduce((acc, id) => acc + (stats[id]?.trueskill ?? 0), 0) / ids.length;
  }, [data, stats]);
  const avgB = useMemo(() => {
    const ids = data?.team_b || [];
    if (!ids.length) return 0;
    return ids.reduce((acc, id) => acc + (stats[id]?.trueskill ?? 0), 0) / ids.length;
  }, [data, stats]);
  const diff = Math.abs(avgA - avgB);
  const balancePct = Math.max(0, Math.min(100, 100 - (diff / 15) * 100));

  const share = async () => {
    const url = window.location.origin + "/next";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Prochaine compo", text: "Voici la compo du prochain match :", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Lien copié dans le presse-papiers");
      }
    } catch (_) {
      // user cancelled share or clipboard unavailable
    }
  };

  if (loading) {
    return <div className="label-overline">Loading…</div>;
  }

  const hasLineup = (data?.team_a?.length || 0) + (data?.team_b?.length || 0) > 0;

  return (
    <div className="space-y-6" data-testid="next-lineup-page">
      <header className="flex items-start justify-between gap-4 flex-wrap fade-up">
        <div>
          <div className="label-overline text-[#CCFF00] flex items-center gap-2">
            <Sparkles size={12} /> Next match
          </div>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black mt-2">
            Prochaine compo
          </h1>
          {data?.date || data?.venue ? (
            <div className="mt-3 flex flex-wrap gap-2 text-sm text-[#aaa]">
              {data.date && (
                <span className="inline-flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-3 py-1">
                  <Calendar size={13} /> {data.date}
                </span>
              )}
              {data.venue && (
                <span className="inline-flex items-center gap-2 bg-[#111] border border-[#222] rounded-full px-3 py-1">
                  <MapPin size={13} /> {data.venue}
                </span>
              )}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button onClick={share} className="btn-secondary flex items-center gap-2 text-sm" data-testid="share-next-btn">
            <Share2 size={14} /> Partager
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate("/next/edit")}
              className="btn-primary flex items-center gap-2 text-sm"
              data-testid="edit-next-btn"
            >
              <Pencil size={14} /> Modifier
            </button>
          )}
        </div>
      </header>

      {!hasLineup ? (
        <div className="card-surface p-8 text-center fade-up">
          <UsersIcon size={28} className="mx-auto text-[#444]" />
          <div className="font-display text-2xl font-bold mt-3">Pas encore de compo</div>
          <p className="text-[#888] mt-2">
            {isAdmin
              ? "Définissez la prochaine composition manuellement ou via le générateur d'équipes."
              : "L'admin n'a pas encore défini la prochaine composition."}
          </p>
          {isAdmin && (
            <div className="mt-5 flex gap-2 justify-center">
              <button
                onClick={() => navigate("/next/edit")}
                className="btn-primary"
                data-testid="empty-edit-next"
              >
                Composer manuellement
              </button>
              <button
                onClick={() => navigate("/generator")}
                className="btn-secondary"
                data-testid="empty-go-generator"
              >
                Ouvrir le générateur
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Balance card */}
          <section className="card-surface p-5 fade-up">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="label-overline">Équilibre</div>
                <div className="font-display text-2xl font-bold mt-1">
                  Balance{" "}
                  <span className="text-[#CCFF00] font-mono">{balancePct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="label-overline" style={{ color: "#CCFF00" }}>Skill A</div>
                  <div className="font-mono text-2xl font-bold">{avgA.toFixed(2)}</div>
                </div>
                <div className="text-[#444] font-mono text-2xl">·</div>
                <div className="text-right">
                  <div className="label-overline" style={{ color: "#5BB0FF" }}>Skill B</div>
                  <div className="font-mono text-2xl font-bold">{avgB.toFixed(2)}</div>
                </div>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-[#222] rounded-full overflow-hidden">
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: "100%",
                  background: `linear-gradient(90deg, #CCFF00 0%, #CCFF00 ${50 + ((avgA - avgB) / Math.max(1, avgA + avgB)) * 50}%, #007AFF ${50 + ((avgA - avgB) / Math.max(1, avgA + avgB)) * 50}%, #007AFF 100%)`,
                }}
              />
            </div>
          </section>

          {/* Teams: mobile = stacked, desktop = side by side */}
          <section className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-4 lg:gap-6 items-stretch">
            <TeamCard
              letter="A"
              ids={data.team_a || []}
              players={players}
              stats={stats}
              avg={avgA}
              data-testid="team-card-A"
            />
            <div className="hidden lg:flex items-center justify-center">
              <div className="font-display font-black text-4xl text-[#444] tracking-tighter">VS</div>
            </div>
            <div className="lg:hidden flex items-center justify-center py-1">
              <div className="font-display font-black text-3xl text-[#444] tracking-tighter">VS</div>
            </div>
            <TeamCard
              letter="B"
              ids={data.team_b || []}
              players={players}
              stats={stats}
              avg={avgB}
              data-testid="team-card-B"
            />
          </section>

          {data?.updated_at && (
            <div className="text-center text-xs text-[#555]">
              Dernière mise à jour : {new Date(data.updated_at).toLocaleString("fr-FR")}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TeamCard({ letter, ids, players, stats, avg }) {
  const meta = TEAM_META[letter];
  return (
    <div
      className={`relative rounded-xl border ${meta.border} ${meta.softBg} p-4 sm:p-5 overflow-hidden`}
      data-testid={`team-card-${letter}`}
    >
      <div className={`absolute -top-12 -right-12 h-32 w-32 rounded-full ${meta.bg} opacity-10 blur-2xl`} />
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-md text-xs font-black tracking-widest ${meta.badge}`}>{meta.name}</span>
          <span className="text-xs text-[#888]">{ids.length} joueurs</span>
        </div>
        <div className="text-right">
          <div className="label-overline" style={{ color: meta.color }}>Avg Skill</div>
          <div className="font-mono text-xl font-bold">{avg.toFixed(2)}</div>
        </div>
      </div>

      <ul className="space-y-2">
        {ids.length === 0 ? (
          <li className="text-sm text-[#666] py-4 text-center">Aucun joueur</li>
        ) : (
          ids.map((pid) => {
            const p = players[pid];
            const s = stats[pid];
            const skill = s?.trueskill ?? 0;
            const winRate = s?.win_rate ?? 0;
            const last5 = (s?.last_results || "").split("");
            const matchesPlayed = s?.matches_played ?? 0;
            return (
              <li
                key={pid}
                className="bg-[#0a0a0a]/80 border border-[#222] rounded-lg p-3 flex items-center gap-3"
                data-testid={`team-${letter}-tile-${pid}`}
              >
                {/* Avatar */}
                <div
                  className={`shrink-0 h-12 w-12 grid place-items-center rounded-lg font-display font-black text-base text-black`}
                  style={{ background: meta.color }}
                >
                  {initial(p?.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/player/${pid}`}
                    className="font-semibold text-white hover:text-[#CCFF00] truncate block"
                  >
                    {p?.name || "?"}
                  </Link>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="font-mono text-xs text-[#888]">{winRate}% WR</span>
                    <span className="text-[#333]">·</span>
                    <span className="font-mono text-xs text-[#888]">{matchesPlayed}M</span>
                    {last5.length > 0 && (
                      <>
                        <span className="text-[#333]">·</span>
                        <span className="flex gap-1">
                          {last5.map((c, i) => (
                            <span
                              key={i}
                              className={`h-3 w-3 rounded-sm text-[8px] grid place-items-center font-bold ${formColor(c)}`}
                              title={c}
                            >
                              {c}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="label-overline">Skill</div>
                  <div
                    className="font-mono text-lg font-black"
                    style={{ color: skill >= 5 ? meta.color : skill >= 2 ? "#fff" : skill >= 0 ? "#aaa" : "#FF6B5C" }}
                  >
                    {skill.toFixed(2)}
                  </div>
                </div>
              </li>
            );
          })
        )}
      </ul>

      {ids.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#222] flex items-center justify-between text-xs text-[#888]">
          <span className="inline-flex items-center gap-1">
            <Trophy size={12} /> Pool moyen
          </span>
          <span className="font-mono">{avg.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
