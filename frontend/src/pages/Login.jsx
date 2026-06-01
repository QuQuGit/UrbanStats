import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function Login() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleLogin = () => {
    const redirectUrl = window.location.origin + "/";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0a0a0a]">
      <img
        src="https://images.unsplash.com/photo-1676746424139-77f8bd8922a8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwyfHxzb2NjZXIlMjBmaWVsZCUyMHVuZGVyJTIwbmlnaHQlMjBsaWdodHN8ZW58MHx8fHwxNzgwMzAwMjM5fDA&ixlib=rb-4.1.0&q=85"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black" />
      <div className="relative z-10 min-h-screen grid place-items-center px-6">
        <div className="max-w-md w-full">
          <div className="label-overline mb-3 text-[#CCFF00] fade-up">Football · 5v5 · Stats</div>
          <h1 className="font-display text-5xl sm:text-6xl font-black tracking-tighter leading-[0.95] fade-up delay-1">
            Track every kick.
            <br />
            <span className="text-[#CCFF00]">Crown every legend.</span>
          </h1>
          <p className="mt-5 text-[#999] text-base leading-relaxed fade-up delay-2">
            Stats automatiques, ELO, classements et équipes équilibrées — à partir de la simple composition
            des équipes et du score final.
          </p>
          <div className="mt-8 card-surface p-6 backdrop-blur-xl bg-black/60 fade-up delay-3">
            <div className="label-overline mb-3">Sign in</div>
            <button
              onClick={handleLogin}
              className="w-full btn-primary flex items-center justify-center gap-3 text-base py-3"
              data-testid="google-login-btn"
            >
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.3 7.1 29.4 5 24 5 16.3 5 9.6 9.4 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.2c-2 1.4-4.6 2.4-7.3 2.4-5.2 0-9.7-3.3-11.3-8l-6.6 5.1C9.5 39.5 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.6l6.3 5.2C41.6 35.3 44 30 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              Continue with Google
            </button>
            <p className="mt-4 text-xs text-[#666]">
              Vos données restent privées. Le système n'utilise que la composition des équipes et le score
              pour calculer toutes les statistiques.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-4 fade-up delay-4">
            <Feature label="ELO" value="1500" />
            <Feature label="Joueurs" value="40+" />
            <Feature label="Équilibrage" value="98%" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ label, value }) {
  return (
    <div className="card-surface bg-black/60 backdrop-blur-md p-4">
      <div className="label-overline">{label}</div>
      <div className="font-mono text-2xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}
