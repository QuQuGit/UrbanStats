import { BrowserRouter, Route, Routes } from "react-router-dom";
import "@/App.css";
import { AuthProvider } from "@/context/AuthContext";
import AdminRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Players from "@/pages/Players";
import Matches from "@/pages/Matches";
import MatchForm from "@/pages/MatchForm";
import TeamGenerator from "@/pages/TeamGenerator";
import PlayerProfile from "@/pages/PlayerProfile";
import { Toaster } from "sonner";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="login" element={<Login />} />
            <Route path="players" element={<Players />} />
            <Route path="player/:id" element={<PlayerProfile />} />
            <Route path="matches" element={<Matches />} />
            <Route path="generator" element={<TeamGenerator />} />
            <Route
              path="matches/new"
              element={<AdminRoute><MatchForm /></AdminRoute>}
            />
            <Route
              path="matches/:id/edit"
              element={<AdminRoute><MatchForm /></AdminRoute>}
            />
          </Route>
        </Routes>
        <Toaster
          theme="dark"
          position="top-right"
          toastOptions={{ style: { background: "#111", border: "1px solid #222", color: "#fff" } }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
