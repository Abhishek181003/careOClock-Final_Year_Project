import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HOME_BY_ROLE = {
  patient: '/app/patient',
  caregiver: '/app/caregiver',
  doctor: '/app/doctor',
};

export default function RoleRoute({ allow }) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) {
    return <Navigate to={HOME_BY_ROLE[user.role] ?? '/'} replace />;
  }
  return <Outlet />;
}
