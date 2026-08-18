import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, SessionUser, UserRole } from '../types'

interface LoginResult { error: string | null }

interface AuthContextValue {
  user: SessionUser | null
  loading: boolean
  error: string | null
  login: (email: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const validRoles: UserRole[] = ['admin', 'seller']

function readableAuthError(message: string) {
  if (/invalid login credentials/i.test(message)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(message)) return 'Debes confirmar tu correo antes de ingresar.'
  if (/failed to fetch|network/i.test(message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return 'No fue posible iniciar sesión. Inténtalo nuevamente.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfile = useCallback(async (authUser: User): Promise<LoginResult> => {
    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', authUser.id)
      .single<Profile>()

    if (profileError || !data) {
      await supabase.auth.signOut()
      const message = 'Tu usuario no tiene un perfil válido o no puede leerlo.'
      setUser(null); setError(message)
      return { error: message }
    }
    if (!validRoles.includes(data.role)) {
      await supabase.auth.signOut()
      const message = 'El perfil tiene un rol no reconocido.'
      setUser(null); setError(message)
      return { error: message }
    }
    if (!data.is_active) {
      await supabase.auth.signOut()
      const message = 'Tu cuenta está inactiva. Contacta al administrador.'
      setUser(null); setError(message)
      return { error: message }
    }

    setUser({ id: data.id, name: data.full_name, email: authUser.email ?? '', role: data.role, active: data.is_active })
    setError(null)
    return { error: null }
  }, [])

  useEffect(() => {
    let active = true
    const restoreSession = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!active) return
      if (sessionError) { setError('No fue posible restaurar la sesión.'); setUser(null); setLoading(false); return }
      if (data.session?.user) await loadProfile(data.session.user)
      else setUser(null)
      if (active) setLoading(false)
    }
    void restoreSession()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'SIGNED_OUT' || !session?.user) { setUser(null); setLoading(false); return }
      setLoading(true)
      window.setTimeout(() => { if (active) void loadProfile(session.user).finally(() => active && setLoading(false)) }, 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [loadProfile])

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    setLoading(true); setError(null)
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError || !data.user) {
      const message = readableAuthError(signInError?.message ?? '')
      setUser(null); setError(message); setLoading(false)
      return { error: message }
    }
    const result = await loadProfile(data.user)
    setLoading(false)
    return result
  }, [loadProfile])

  const logout = useCallback(async () => {
    setLoading(true)
    const { error: signOutError } = await supabase.auth.signOut()
    setUser(null); setLoading(false)
    if (signOutError) setError('No fue posible cerrar la sesión correctamente.')
    else setError(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const value = useMemo(() => ({ user, loading, error, login, logout, clearError }), [user, loading, error, login, logout, clearError])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
