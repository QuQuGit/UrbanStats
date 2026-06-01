import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LogOut, LayoutDashboard, Users, ListChecks, Shuffle, PlusCircle } from "lucide-react";

const navLinkClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
    isActive
      ? "bg-[#1a1a1a] text-white"
      : "text-[#888] hover:text-white hover:bg-[#1a1a1a]"
  }`;

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header
        className="sticky top-0 z-40 backdrop-blur-xl bg-black/60 border-b border-white/10"
        data-testid="app-header"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-link">
            <div className="h-8 w-8 rounded-md bg-[#CCFF00] text-black grid place-items-center font-black">5</div>
            <div className="font-display font-black text-lg tracking-tight">FIVES<span className="text-[#CCFF00]">.</span></div>
          </Link>
          <nav className="hidden md:flex items-center gap-1 ml-4">
            <NavLink to="/" end className={navLinkClass} data-testid="nav-dashboard">
              <LayoutDashboard size={16} /> Dashboard
            </NavLink>
            <NavLink to="/players" className={navLinkClass} data-testid="nav-players">
              <Users size={16} /> Joueurs
            </NavLink>
            <NavLink to="/matches" className={navLinkClass} data-testid="nav-matches">
              <ListChecks size={16} /> Matches
            </NavLink>
            <NavLink to="/generator" className={navLinkClass} data-testid="nav-generator">
              <Shuffle size={16} /> Générateur
            </NavLink>
          </nav>
          <div className="flex-1" />
          <button
            onClick={() => navigate("/matches/new")}
            className="btn-primary hidden sm:flex items-center gap-2 text-sm"
            data-testid="header-new-match-btn"
          >
            <PlusCircle size={16} /> Nouveau match
          </button>
          <div className="flex items-center gap-3 pl-3 border-l border-white/10">
            <div className="text-right hidden sm:block">
              <div className="text-xs text-[#888]">Connecté</div>
              <div className="text-sm font-medium" data-testid="user-name">{user?.name}</div>
            </div>
            {user?.picture && (
              <img src={user.picture} alt="" className="h-8 w-8 rounded-full border border-white/10" />
            )}
            <button
              onClick={logout}
              className="p-2 rounded-md text-[#888] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="Déconnexion"
              data-testid="logout-btn"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="md:hidden flex gap-1 overflow-x-auto px-3 pb-2 border-t border-white/5">
          <NavLink to="/" end className={navLinkClass} data-testid="nav-dashboard-mobile">
            <LayoutDashboard size={14} /> Dashboard
          </NavLink>
          <NavLink to="/players" className={navLinkClass} data-testid="nav-players-mobile">
            <Users size={14} /> Joueurs
          </NavLink>
          <NavLink to="/matches" className={navLinkClass} data-testid="nav-matches-mobile">
            <ListChecks size={14} /> Matches
          </NavLink>
          <NavLink to="/generator" className={navLinkClass} data-testid="nav-generator-mobile">
            <Shuffle size={14} /> Gen
          </NavLink>
        </nav>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}
