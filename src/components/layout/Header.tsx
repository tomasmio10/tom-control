import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout, loading } = useAuth()
  const navigate = useNavigate()
  const leave = async () => { await logout(); navigate('/login', { replace: true }) }
  return (
    <header className="topbar">
      <button className="menu-button" onClick={onMenu} aria-label="Abrir menú">☰</button>
      <div className="topbar-context"><span>TOM-ELECTRIC</span><strong>Centro de control comercial</strong></div>
      <div className="user-menu">
        <div className="avatar">{user?.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</div>
        <div className="user-copy"><strong>{user?.name}</strong><span>{user?.role === 'admin' ? 'Administrador' : 'Vendedor'}</span></div>
        <button className="logout-button" onClick={() => void leave()} disabled={loading}>{loading ? 'Saliendo…' : 'Salir'}</button>
      </div>
    </header>
  )
}
