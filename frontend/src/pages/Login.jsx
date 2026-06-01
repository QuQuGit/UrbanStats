import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { ShieldCheck, LogIn } from "lucide-react";

export default function Login() {
  const { isAdmin, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAdmin) navigate("/", { replace: true });
  }, [isAdmin, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(apiError(err, "Connexion impossible"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-[80vh] grid place-items-center" data-testid="login-page">
      <img
        src="https://images.unsplash.com/photo-1676746424139-77f8bd8922a8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NjZ8MHwxfHNlYXJjaHwyfHxzb2NjZXIlMjBmaWVsZCUyMHVuZGVyJTIwbmlnaHQlMjBsaWdodHN8ZW58MHx8fHwxNzgwMzAwMjM5fDA&ixlib=rb-4.1.0&q=85"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-25 -z-10 rounded-lg"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/80 -z-10 rounded-lg" />
      <div className="w-full max-w-md">
        <div className="label-overline text-[#CCFF00] fade-up">Espace administrateur</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mt-2 fade-up delay-1">
          Connexion <span className="text-[#CCFF00]">admin</span>
        </h1>
        <p className="text-[#888] mt-3 fade-up delay-2">
          Seul l'admin peut saisir et modifier les matches. Les statistiques et classements restent
          visibles par tous.
        </p>

        <form
          onSubmit={onSubmit}
          className="card-surface p-6 mt-6 backdrop-blur-md bg-black/60 fade-up delay-3"
          data-testid="login-form"
        >
          <div>
            <div className="label-overline mb-2">Email</div>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@example.com"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00]"
              data-testid="login-email-input"
            />
          </div>
          <div className="mt-4">
            <div className="label-overline mb-2">Mot de passe</div>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#0a0a0a] border border-[#222] rounded-md px-3 py-2 text-sm focus:outline-none focus:border-[#CCFF00]"
              data-testid="login-password-input"
            />
          </div>
          {error && (
            <div className="mt-3 text-sm text-[#FF3B30]" data-testid="login-error">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
            data-testid="login-submit-btn"
          >
            {submitting ? (
              "Connexion…"
            ) : (
              <>
                <LogIn size={16} /> Se connecter
              </>
            )}
          </button>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#666]">
            <ShieldCheck size={12} /> JWT 12h, stocké en local
          </div>
        </form>
      </div>
    </div>
  );
}
