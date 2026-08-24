import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { user, loading, error, login, clearError } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  useEffect(() => () => clearError(), [clearError])
  if (user) return <Navigate to="/dashboard" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await login(email, password)
    if (!result.error) {
      const destination = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard'
      navigate(destination, { replace: true })
    }
  }

  return <main className="login-page">
    <section className="login-visual"><div className="login-brand"><span className="brand-mark">T</span><div><strong>TOM</strong><span>CONTROL</span></div></div><div className="energy-grid" aria-hidden="true"><i /><i /><i /><i /></div><div className="login-message"><span className="eyebrow light">TOM-ELECTRIC</span><h1>Energía que se convierte en control.</h1><p>Una vista clara de pedidos, productos y equipo comercial para tomar mejores decisiones.</p></div><div className="login-proof"><b>100%</b><span>Acceso protegido<br />según tu perfil</span></div></section>
    <section className="login-panel"><form className="login-card" onSubmit={submit}><span className="login-kicker">ACCESO SEGURO</span><h2>Bienvenido a TOM-CONTROL</h2><p>Ingresa con el correo y contraseña asignados a tu cuenta.</p>
      {error && <div className="login-error" role="alert"><span>!</span><p>{error}</p></div>}
      <div className="login-fields"><label><span>Correo electrónico</span><input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError() }} placeholder="nombre@tomelectric.co" required /></label><label><span>Contraseña</span><div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => { setPassword(event.target.value); clearError() }} placeholder="Ingresa tu contraseña" required /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></label><Link className="forgot-password-link" to="/recuperar-contrasena">¿Olvidaste tu contraseña?</Link></div>
      <button className="primary-button full" type="submit" disabled={loading}>{loading ? 'Verificando acceso…' : 'Ingresar al panel'} <span>→</span></button><div className="secure-note"><span>✓</span><p>Tu rol y permisos se verifican automáticamente con TOM-ELECTRIC.</p></div>
    </form></section>
  </main>
}
