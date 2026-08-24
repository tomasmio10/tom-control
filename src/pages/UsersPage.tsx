import { useCallback, useEffect, useMemo, useState } from 'react'
import { InviteUserModal } from '../components/users/InviteUserModal'
import { CommissionPaymentModal } from '../components/commissions/CommissionPaymentModal'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { invokeAdminUsers } from '../lib/adminUsers'
import { getCommissionSummary } from '../lib/commissions'
import { formatCurrency } from '../data/mockData'
import type { SellerCommissionSummary, UserRole } from '../types'

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
  const [success, setSuccess] = useState<{ message: string; detail: string } | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [payingSeller, setPayingSeller] = useState<SellerCommissionSummary | null>(null)
  const [commissions, setCommissions] = useState<Map<string, SellerCommissionSummary>>(new Map())

  const refreshUsers = useCallback(async () => {
    if (user?.role !== 'admin' || !user.active) return
    setLoading(true); setError('')
    const [usersResult, commissionsResult] = await Promise.allSettled([
      invokeAdminUsers<{ users: AdminUserRow[] }>({ method: 'GET' }),
      getCommissionSummary(),
    ])
    const messages: string[] = []
    if (usersResult.status === 'fulfilled') {
      if (usersResult.value.error) messages.push(await readableFunctionError(usersResult.value.error, 'No fue posible cargar los usuarios.'))
      else setUsers(usersResult.value.data?.users ?? [])
    } else messages.push(usersResult.reason instanceof Error ? usersResult.reason.message : 'No fue posible cargar los usuarios.')
    if (commissionsResult.status === 'fulfilled') setCommissions(new Map(commissionsResult.value.map((summary) => [summary.sellerId, summary])))
    else messages.push(commissionsResult.reason instanceof Error ? commissionsResult.reason.message : 'No fue posible cargar las comisiones.')
    setError(messages.join(' '))
    setLoading(false)
  }, [user])

  useEffect(() => { const timer = window.setTimeout(() => void refreshUsers(), 0); return () => window.clearTimeout(timer) }, [refreshUsers])

  const visibleUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return normalized ? users.filter((item) => `${item.full_name} ${item.email}`.toLowerCase().includes(normalized)) : users
  }, [query, users])

  return <>
    {success && <div className="success-banner" role="status"><span>✓</span><div><strong>{success.message}</strong><small>{success.detail}</small></div><button type="button" onClick={() => setSuccess(null)} aria-label="Cerrar confirmación">×</button></div>}
    <PageHeader eyebrow="EQUIPO TOM-ELECTRIC" title="Usuarios" description="Gestiona el acceso y los roles del equipo comercial." action={<button type="button" className="primary-button" onClick={() => setInviteOpen(true)}>+ Invitar usuario</button>} />
    {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar el equipo</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refreshUsers()}>Reintentar</button></div>}
    <section className="panel"><div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o correo..." /></label><button type="button" className="secondary-button">Todos los roles</button></div>
      {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando usuarios desde Supabase…</strong></div> : <div className="table-wrap users-commission-table"><table><thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último acceso</th><th>Comisiones pagadas</th><th>Comisiones por pagar</th><th>Acción</th></tr></thead><tbody>{visibleUsers.map((item) => { const commission = commissions.get(item.id); return <tr key={item.id}><td><div className="person-cell"><span>{initials(item.full_name)}</span><div><strong>{item.full_name}</strong><small>{item.email}</small></div></div></td><td><span className={`role-badge ${item.role}`}>{item.role === 'admin' ? 'Administrador' : 'Vendedor'}</span></td><td><span className={`status ${item.is_active ? 'activo' : 'inactivo'}`}>{item.is_active ? 'Activo' : 'Inactivo'}</span></td><td>{formatLastAccess(item.last_sign_in_at)}</td><td className="money">{item.role === 'seller' ? formatCurrency(commission?.paidCommission ?? 0) : '—'}</td><td className="money due-money">{item.role === 'seller' ? formatCurrency(commission?.pendingCommission ?? 0) : '—'}</td><td>{item.role === 'seller' ? commission && commission.pendingCommission > 0 ? <button type="button" className="primary-button commission-user-pay" onClick={() => setPayingSeller(commission)}>Pagar comisión</button> : <span className="commission-current">Al día</span> : '—'}</td></tr> })}</tbody></table>{!visibleUsers.length && !error && <div className="empty-state">{query ? 'No hay usuarios que coincidan con la búsqueda.' : 'Todavía no hay usuarios registrados.'}</div>}</div>}
    </section>
    {inviteOpen && <InviteUserModal onClose={() => setInviteOpen(false)} onInvited={async (email) => { setInviteOpen(false); setSuccess({ message: `Invitación enviada a ${email}.`, detail: 'El perfil está activo y la invitación fue enviada de forma segura.' }); await refreshUsers() }} />}
    {payingSeller && <CommissionPaymentModal seller={payingSeller} onClose={() => setPayingSeller(null)} onPaid={async () => { await refreshUsers(); setSuccess({ message: `Pago de comisión registrado para ${payingSeller.fullName}.`, detail: 'Comisiones pagadas y saldo pendiente actualizados desde Supabase.' }) }} />}
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
