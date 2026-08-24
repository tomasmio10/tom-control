import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { UserRole } from '../../types'

export function InviteUserModal({ onClose, onInvited }: { onClose: () => void; onInvited: (email: string) => Promise<void> }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('seller')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    const normalizedEmail = email.trim().toLowerCase()
    if (!fullName.trim() || !normalizedEmail) { setError('Nombre completo, correo electrónico y rol son obligatorios.'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) { setError('Ingresa un correo electrónico válido.'); return }
    setSaving(true)
    const { error: functionError } = await supabase.functions.invoke('admin-users', { body: { fullName: fullName.trim(), email: normalizedEmail, role } })
    if (functionError) setError(await inviteError(functionError))
    else await onInvited(normalizedEmail)
    setSaving(false)
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
    <form className="product-modal" role="dialog" aria-modal="true" aria-labelledby="invite-user-title" onSubmit={submit}>
      <header className="import-header"><div><span className="eyebrow">ACCESO SEGURO</span><h2 id="invite-user-title">Invitar usuario</h2><p>Supabase enviará un enlace para que la persona establezca su propia contraseña.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></header>
      <div className="product-form-grid">
        <label className="field wide"><span>Nombre completo *</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nombre y apellidos" autoFocus /></label>
        <label className="field wide"><span>Correo electrónico *</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="persona@empresa.com" /></label>
        <label className="field"><span>Rol *</span><select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option value="seller">Vendedor</option><option value="admin">Administrador</option></select></label>
        <label className="field"><span>Estado inicial</span><input value="Activo" disabled /></label>
      </div>
      {error && <div className="product-form-error" role="alert">{error}</div>}
      <footer className="import-actions"><div><strong>Invitación protegida</strong><span>El administrador nunca conocerá la contraseña del nuevo usuario.</span></div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enviando…' : 'Enviar invitación'}</button></footer>
    </form>
  </div>
}

async function inviteError(cause: unknown) {
  if (cause && typeof cause === 'object' && 'context' in cause && cause.context instanceof Response) {
    try { const body = await cause.context.clone().json() as { error?: string }; if (body.error) return body.error } catch { /* respuesta sin JSON */ }
  }
  if (cause instanceof Error && /failed to fetch/i.test(cause.message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return 'No fue posible enviar la invitación. Inténtalo nuevamente.'
}
