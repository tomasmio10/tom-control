import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { setReady(Boolean(data.session)); setChecking(false) }) }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (password !== confirmation) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message || 'No fue posible guardar la contraseña.')
    else { await supabase.auth.signOut(); setComplete(true) }
    setSaving(false)
  }

  return <main className="login-panel password-setup-page"><section className="login-card">
    <span className="eyebrow">INVITACIÓN TOM-CONTROL</span><h2>Establece tu contraseña</h2><p>Crea una contraseña personal. El administrador no tendrá acceso a ella.</p>
    {checking ? <div className="catalog-loading" role="status"><span /><strong>Validando invitación…</strong></div> : complete ? <div className="success-banner"><span>✓</span><div><strong>Contraseña creada correctamente</strong><small>Ya puedes ingresar a TOM-CONTROL.</small></div></div> : !ready ? <div className="login-error" role="alert"><span>!</span><p>La invitación no es válida o ya expiró. Solicita una nueva invitación al administrador.</p></div> : <form onSubmit={submit}><div className="login-fields"><label><span>Nueva contraseña</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label><span>Confirmar contraseña</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label></div>{error && <div className="login-error" role="alert"><span>!</span><p>{error}</p></div>}<button type="submit" className="primary-button full" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button></form>}
    {(complete || !ready) && !checking && <Link className="primary-button full" to="/login">Ir al inicio de sesión</Link>}
  </section></main>
}
