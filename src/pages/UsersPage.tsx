import { PageHeader } from '../components/ui/PageHeader'
import { users } from '../data/mockData'

export function UsersPage() {
  return <><PageHeader eyebrow="EQUIPO TOM-ELECTRIC" title="Usuarios" description="Gestiona el acceso y los roles del equipo comercial." action={<button className="primary-button">+ Invitar usuario</button>} />
    <section className="panel"><div className="toolbar"><label className="search"><span>⌕</span><input placeholder="Buscar por nombre o correo..." /></label><button className="secondary-button">Todos los roles</button></div><div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th /></tr></thead><tbody>{users.map((u) => <tr key={u.id}><td><div className="person-cell"><span>{u.name.split(' ').map((n) => n[0]).slice(0,2).join('')}</span><div><strong>{u.name}</strong><small>{u.email}</small></div></div></td><td><span className={`role-badge ${u.role}`}>{u.role === 'admin' ? 'Administrador' : 'Vendedor'}</span></td><td><span className={`status ${u.status.toLowerCase()}`}>{u.status}</span></td><td>{u.lastAccess}</td><td><button className="dots" aria-label={`Opciones de ${u.name}`}>•••</button></td></tr>)}</tbody></table></div></section></>
}
