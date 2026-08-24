import { useCallback, useEffect, useMemo, useState } from 'react'
import { InviteUserModal } from '../components/users/InviteUserModal'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { invokeAdminUsers } from '../lib/adminUsers'
import type { UserRole } from '../types'

interface AdminUserRow {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  last_sign_in_at: string | null
}

export function UsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)

  const refreshUsers = useCallback(async () => {
    if (user?.role !== 'admin' || !user.active) return
    setLoading(true); setError('')
    try {
      const { data, error: functionError } = await invokeAdminUsers<{ users: AdminUserRow[] }>({ method: 'GET' })
      if (functionError) setError(await readableFunctionError(functionError, 'No fue posible cargar los usuarios.'))
      else setUsers(data?.users ?? [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar los usuarios.') }
    setLoading(false)
  }, [user])

  useEffect(() => { const timer = window.setTimeout(() => void refreshUsers(), 0); return () => window.clearTimeout(timer) }, [refreshUsers])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? users.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(normalized)) : users
  }, [query, users])

  return <>
    {success && <div className="success-banner" role="status"><span>✓</span><div><strong>{success}</strong><small>El perfil está activo y la invitación fue enviada de forma segura.</small></div><button type="button" onClick={() => setSuccess('')} aria-label="Cerrar confirmación">×</button></div>}
    <PageHeader eyebrow="EQUIPO TOM-ELECTRIC" title="Usuarios" description="Gestiona el acceso y los roles del equipo comercial." action={<button type="button" className="primary-button" onClick={() => setInviteOpen(true)}>+ Invitar usuario</button>} />
    {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar el equipo</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refreshUsers()}>Reintentar</button></div>}
    <section className="panel"><div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o correo..." /></label><button type="button" className="secondary-button">Todos los roles</button></div>
      {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando usuarios desde Supabase…</strong></div> : <div className="table-wrap"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th></tr></thead><tbody>{visibleUsers.map((item) => <tr key={item.id}><td><div className="person-cell"><span>{initials(item.full_name)}</span><div><strong>{item.full_name}</strong><small>{item.email}</small></div></div></td><td><span className={`role-badge ${item.role}`}>{item.role === 'admin' ? 'Administrador' : 'Vendedor'}</span></td><td><span className={`status ${item.is_active ? 'activo' : 'inactivo'}`}>{item.is_active ? 'Activo' : 'Inactivo'}</span></td><td>{formatLastAccess(item.last_sign_in_at)}</td></tr>)}</tbody></table>{!visibleUsers.length && !error && <div className="empty-state">{query ? 'No hay usuarios que coincidan con la búsqueda.' : 'Todavía no hay usuarios registrados.'}</div>}</div>}
    </section>
    {inviteOpen && <InviteUserModal onClose={() => setInviteOpen(false)} onInvited={async (email) => { setInviteOpen(false); setSuccess(`Invitación enviada a ${email}.`); await refreshUsers() }} />}
  </>
}

async function readableFunctionError(cause: unknown, fallback: string) {
  if (cause && typeof cause === 'object' && 'context' in cause) {
    const context = cause.context
    if (context instanceof Response) {
      try { const body = await context.clone().json() as { error?: string }; if (body.error) return body.error } catch { /* respuesta sin JSON */ }
    }
  }
  if (cause instanceof Error && /failed to fetch/i.test(cause.message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return fallback
}

function initials(name: string) { return name.split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() }
function formatLastAccess(value: string | null) { return value ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) : 'Sin acceso todavía' }
