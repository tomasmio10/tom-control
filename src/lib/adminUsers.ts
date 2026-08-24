import { supabase } from './supabase'

export async function invokeAdminUsers<T>(options: { method?: 'GET' | 'POST'; body?: Record<string, unknown> } = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.')
  return supabase.functions.invoke<T>('admin-users', {
    ...options,
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}
