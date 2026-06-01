import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export default function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="label-overline">Loading…</div>
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/login" replace />;
  return children;
}
