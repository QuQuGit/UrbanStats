import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

// REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;
    const run = async () => {
      try {
        const hash = window.location.hash || "";
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const sessionId = params.get("session_id");
        if (!sessionId) {
          navigate("/login", { replace: true });
          return;
        }
        const { data } = await api.post("/auth/session", { session_id: sessionId });
        setUser(data.user);
        // clear hash and navigate to dashboard
        window.history.replaceState({}, "", "/");
        navigate("/", { replace: true, state: { user: data.user } });
      } catch (e) {
        navigate("/login", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-white">
      <div className="text-center" data-testid="auth-callback-loader">
        <div className="label-overline mb-3">Authenticating</div>
        <div className="font-display text-3xl font-black tracking-tight">Connecting your session…</div>
      </div>
    </div>
  );
}
