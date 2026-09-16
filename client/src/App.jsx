import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import RoleRoute from './routes/RoleRoute';
import AppShell from './components/layout/AppShell';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import PatientHome from './pages/patient/PatientHome';
import CaregiverHome from './pages/caregiver/CaregiverHome';
import DoctorTriage from './pages/doctor/DoctorTriage';
import MedicinePage from './pages/patient/MedicinePage';
import ReportsPage from './pages/patient/ReportsPage';
import ProfilePage from './pages/profile/ProfilePage';
import ComingSoon from './pages/ComingSoon';

const HOME_BY_ROLE = {
  patient: '/app/patient',
  caregiver: '/app/caregiver',
  doctor: '/app/doctor',
};

function AppIndexRedirect() {
  const { user } = useAuth();
  const target = user?.role ? HOME_BY_ROLE[user.role] || '/app/patient' : '/login';
  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated Application Shell */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/app" element={<AppIndexRedirect />} />

              {/* Patient Ritual Dashboard */}
              <Route element={<RoleRoute allow={['patient']} />}>
                <Route path="/app/patient" element={<PatientHome />} />
              </Route>

              {/* Caregiver Reassurance Dashboard */}
              <Route element={<RoleRoute allow={['caregiver']} />}>
                <Route path="/app/caregiver" element={<CaregiverHome />} />
              </Route>

              {/* Physician Triage Dashboard */}
              <Route element={<RoleRoute allow={['doctor']} />}>
                <Route path="/app/doctor" element={<DoctorTriage />} />
              </Route>

              {/* Medication Management (Phase 7) */}
              <Route element={<RoleRoute allow={['patient', 'doctor']} />}>
                <Route path="/app/medicine" element={<MedicinePage />} />
              </Route>

              {/* Medical Reports & Records (Phase 8) */}
              <Route element={<RoleRoute allow={['patient', 'doctor', 'caregiver']} />}>
                <Route path="/app/reports" element={<ReportsPage />} />
              </Route>

              {/* User Profile & Care Circle */}
              <Route path="/app/profile" element={<ProfilePage />} />

              {/* Wearable Sync Extension Hook (Phase 11) */}
              <Route
                path="/app/wearable"
                element={<ComingSoon phaseLabel="Phase 11" feature="Wearable OAuth Sync" />}
              />
            </Route>
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
