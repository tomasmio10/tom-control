import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂', roles: ['admin', 'seller'] },
  { to: '/pedidos', label: 'Pedidos', icon: '▤', roles: ['admin', 'seller'] },
  { to: '/productos', label: 'Productos', icon: '◇', roles: ['admin', 'seller'] },
  { to: '/comisiones', label: 'Comisiones', icon: '$', roles: ['admin', 'seller'] },
  { to: '/usuarios', label: 'Usuarios', icon: '◎', roles: ['admin'] },
] as const

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  return (
    <>
      <button className={`sidebar-backdrop ${open ? 'visible' : ''}`} onClick={onClose} aria-label="Cerrar menú" />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="brand-mark">T</span><div><strong>TOM</strong><span>CONTROL</span></div></div>
        <nav className="nav-list" aria-label="Navegación principal">
          <span className="nav-caption">GESTIÓN</span>
          {nav.filter((item) => user && (item.roles as readonly string[]).includes(user.role)).map((item) => (
            <NavLink key={item.to} to={item.to} onClick={onClose} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              <span className="nav-icon">{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer"><span className="live-dot" /> Sistema operativo <small>Datos de demostración</small></div>
      </aside>
    </>
  )
}
