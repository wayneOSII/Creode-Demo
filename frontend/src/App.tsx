import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { LangProvider } from './hooks/useLang';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import ProjectPage from './pages/ProjectPage';
import CanvasPage from './pages/CanvasPage';
import Login from './pages/Login';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';

export default function App() {
  return (
    <LangProvider>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            {/* Root redirect to default language */}
            <Route path="/" element={<Navigate to="/zh-TW" replace />} />

            {/* Language-prefixed routes */}
            <Route path="/:lang">
              <Route index element={<LandingPage />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="login" element={<Login />} />
              <Route path="project/:projectId" element={<ProjectPage />} />
              <Route path="canvas/:projectId" element={<CanvasPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Fallback: redirect to default lang */}
            <Route path="*" element={<Navigate to="/zh-TW" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </LangProvider>
  );
}
