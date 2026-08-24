import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setSending(true)
    const redirectTo = `${window.location.origin}/establecer-contrasena`
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
    if (recoveryError) {
      if (/invalid.*email|email.*invalid/i.test(recoveryError.message)) setError('Ingresa un correo electrónico válido.')
      else if (/failed to fetch|network/i.test(recoveryError.message)) setError('No fue posible conectar con Supabase. Revisa tu conexión.')
      else setError('No fue posible enviar el enlace. Inténtalo nuevamente.')
    } else setSent(true)
    setSending(false)
  }

  return <main className="login-panel password-setup-page"><section className="login-card">
    <span className="eyebrow">RECUPERACIÓN SEGURA</span><h2>Recupera tu contraseña</h2><p>Te enviaremos un enlace seguro para que establezcas una contraseña nueva.</p>
    {sent ? <><div className="success-banner" role="status"><span>✓</span><div><strong>Revisa tu correo</strong><small>Si existe una cuenta asociada, recibirás el enlace de recuperación.</small></div></div><Link className="primary-button full" to="/login">Volver al inicio de sesión</Link></> : <form onSubmit={submit}><div className="login-fields"><label><span>Correo electrónico</span><input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError('') }} placeholder="nombre@tomelectric.co" required /></label></div>{error && <div className="login-error" role="alert"><span>!</span><p>{error}</p></div>}<button type="submit" className="primary-button full" disabled={sending}>{sending ? 'Enviando…' : 'Enviar enlace seguro'}</button></form>}
    {!sent && <Link className="auth-back-link" to="/login">Volver al inicio de sesión</Link>}
  </section></main>
}
