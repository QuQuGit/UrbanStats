import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import AuthCallback from "@/components/AuthCallback";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Players from "@/pages/Players";
import Matches from "@/pages/Matches";
import MatchForm from "@/pages/MatchForm";
import TeamGenerator from "@/pages/TeamGenerator";
import PlayerProfile from "@/pages/PlayerProfile";
import { Toaster } from "sonner";

function AppRouter() {
  const location = useLocation();
  // Detect session_id in URL fragment during render (synchronous) to avoid race conditions.
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="players" element={<Players />} />
        <Route path="player/:id" element={<PlayerProfile />} />
        <Route path="matches" element={<Matches />} />
        <Route path="matches/new" element={<MatchForm />} />
        <Route path="matches/:id/edit" element={<MatchForm />} />
        <Route path="generator" element={<TeamGenerator />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRouter />
        <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#111", border: "1px solid #222", color: "#fff" } }} />
      </BrowserRouter>
    </AuthProvider>
  );
}
