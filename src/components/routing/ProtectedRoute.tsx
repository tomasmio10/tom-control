import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import type { UserRole } from '../../types'

export function ProtectedRoute({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="auth-loading"><span className="auth-spinner" /><strong>Restaurando sesión segura</strong><small>Verificando tu perfil y permisos…</small></div>
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}
