import React from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import Layout from "./components/Layout";
import LoginPage    from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import MapPage      from "./pages/MapPage";
import VehiclesPage from "./pages/VehiclesPage";
import HistoryPage  from "./pages/HistoryPage";
import AlertsPage   from "./pages/AlertsPage";

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen bg-surface text-white">Loading…</div>;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="map"      element={<MapPage />} />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="history"  element={<HistoryPage />} />
            <Route path="alerts"   element={<AlertsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
