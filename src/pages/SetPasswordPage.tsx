import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function SetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState('')

  const requirements = {
    length: password.length >= 8,
    letter: /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(password),
    number: /\d/.test(password),
    match: confirmation.length > 0 && password === confirmation,
  }
  const validPassword = Object.values(requirements).every(Boolean)

  useEffect(() => {
    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      setReady(Boolean(session)); setChecking(false)
    })
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      setReady(!sessionError && Boolean(data.session)); setChecking(false)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!complete) return
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 2500)
    return () => window.clearTimeout(timer)
  }, [complete, navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!validPassword) { setError('Revisa que la contraseña cumpla todos los requisitos.'); return }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) setError(updateError.message || 'No fue posible guardar la contraseña.')
    else { await supabase.auth.signOut(); setComplete(true) }
    setSaving(false)
  }

  return <main className="login-panel password-setup-page"><section className="login-card">
    <span className="eyebrow">ACCESO TOM-CONTROL</span><h2>Establece tu contraseña</h2><p>Crea una contraseña personal. El administrador nunca tendrá acceso a ella.</p>
    {checking ? <div className="catalog-loading" role="status"><span /><strong>Validando enlace seguro…</strong></div> : complete ? <div className="success-banner" role="status"><span>✓</span><div><strong>Contraseña guardada correctamente</strong><small>Te llevaremos al inicio de sesión.</small></div></div> : !ready ? <div className="login-error" role="alert"><span>!</span><p>El enlace no es válido o ya expiró. Solicita una nueva invitación o recuperación.</p></div> : <form onSubmit={submit}><div className="login-fields"><label><span>Contraseña</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label><label><span>Confirmar contraseña</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} autoComplete="new-password" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label></div><ul className="password-requirements" aria-live="polite"><li className={requirements.length ? 'valid' : ''}>Mínimo 8 caracteres</li><li className={requirements.letter ? 'valid' : ''}>Al menos una letra</li><li className={requirements.number ? 'valid' : ''}>Al menos un número</li><li className={requirements.match ? 'valid' : ''}>Las contraseñas coinciden</li></ul>{error && <div className="login-error" role="alert"><span>!</span><p>{error}</p></div>}<button type="submit" className="primary-button full" disabled={saving || !validPassword}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button></form>}
    {(complete || !ready) && !checking && <Link className="primary-button full" to="/login">Ir al inicio de sesión</Link>}
  </section></main>
}
