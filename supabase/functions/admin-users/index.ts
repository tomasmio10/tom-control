/* global Deno */
import { createClient } from 'jsr:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const publishableKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const appUrl = Deno.env.get('APP_URL') ?? 'https://tom-control.tomasmio1000.workers.dev'

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin') ?? ''
  const allowed = origin === appUrl || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)
  return {
    'Access-Control-Allow-Origin': allowed ? origin : appUrl,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  }
}

function response(request: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(request) })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(request) })
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) return response(request, 500, { error: 'La función administrativa no está configurada correctamente.' })

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return response(request, 401, { error: 'Se requiere una sesión autenticada.' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const accessToken = authorization.slice('Bearer '.length).trim()
  const callerClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(accessToken)
  if (callerError || !callerData.user) {
    console.warn('admin-users auth_failed', { errorCode: callerError?.code ?? 'missing_user' })
    return response(request, 401, { error: 'La sesión no es válida o expiró.' })
  }

  const callerId = callerData.user.id
  const { data: profile, error: profileError } = await callerClient.from('profiles').select('id, role, is_active').eq('id', callerId).maybeSingle()
  if (profileError) {
    console.error('admin-users profile_read_failed', { callerId, errorCode: profileError.code, errorMessage: profileError.message })
    const permissionDenied = profileError.code === '42501' || /permission|policy|rls/i.test(profileError.message)
    return response(request, permissionDenied ? 403 : 500, {
      error: permissionDenied
        ? 'Las polÃ­ticas RLS no permiten leer el perfil autenticado.'
        : 'No fue posible verificar el perfil administrativo.',
    })
  }
  if (!profile) {
    console.warn('admin-users profile_missing', { callerId })
    return response(request, 403, { error: 'La cuenta autenticada no tiene un perfil asociado.' })
  }
  if (profile.id !== callerId || profile.role !== 'admin') {
    console.warn('admin-users role_denied', { callerId, profileIdMatches: profile.id === callerId, role: profile.role })
    return response(request, 403, { error: 'El perfil autenticado no tiene rol de administrador.' })
  }
  if (profile.is_active !== true) {
    console.warn('admin-users inactive_denied', { callerId, isActive: profile.is_active })
    return response(request, 403, { error: 'El perfil administrador está inactivo.' })
  }
  console.info('admin-users authorization_ok', { callerId, method: request.method })

  if (request.method === 'GET') {
    const { data: authData, error: authError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (authError) {
      console.error('admin-users auth_list_failed', { callerId, errorCode: authError.code, errorMessage: authError.message })
      return response(request, 500, { error: 'No fue posible consultar las cuentas de autenticaciÃ³n.' })
    }

    const { data: profiles, error: profilesError } = await callerClient.from('profiles').select('id, full_name, role, is_active')
    if (profilesError) {
      console.error('admin-users profiles_list_failed', { callerId, errorCode: profilesError.code, errorMessage: profilesError.message })
      const permissionDenied = profilesError.code === '42501' || /permission|policy|rls/i.test(profilesError.message)
      return response(request, permissionDenied ? 403 : 500, {
        error: permissionDenied
          ? 'Las polÃ­ticas RLS no permiten al administrador consultar el equipo.'
          : 'No fue posible consultar los perfiles registrados.',
      })
    }
    const authUsers = new Map((authData?.users ?? []).map((user) => [user.id, user]))
    const users = (profiles ?? []).map((item) => {
      const authUser = authUsers.get(item.id)
      return { ...item, email: authUser?.email ?? '', last_sign_in_at: authUser?.last_sign_in_at ?? null }
    })
    return response(request, 200, { users })
  }

  if (request.method !== 'POST') return response(request, 405, { error: 'Método no permitido.' })

  let input: { fullName?: unknown; email?: unknown; role?: unknown }
  try { input = await request.json() } catch { return response(request, 400, { error: 'La solicitud no contiene datos válidos.' }) }
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const role = input.role === 'admin' || input.role === 'seller' ? input.role : null
  if (!fullName || !email || !role) return response(request, 400, { error: 'Nombre completo, correo electrónico y rol son obligatorios.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response(request, 400, { error: 'El correo electrónico no es válido.' })

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${appUrl.replace(/\/$/, '')}/establecer-contrasena`,
  })
  if (inviteError || !invited.user) {
    const duplicate = /already|registered|exists/i.test(inviteError?.message ?? '')
    return response(request, duplicate ? 409 : 400, { error: duplicate ? 'El correo ya está registrado.' : (inviteError?.message || 'No fue posible enviar la invitación.') })
  }

  const { error: upsertError } = await callerClient.from('profiles').upsert({ id: invited.user.id, full_name: fullName, role, is_active: true }, { onConflict: 'id' })
  if (upsertError) {
    console.error('admin-users profile_upsert_failed', { callerId, invitedUserId: invited.user.id, errorCode: upsertError.code, errorMessage: upsertError.message })
    await adminClient.auth.admin.deleteUser(invited.user.id)
    return response(request, 500, { error: 'No fue posible crear el perfil. La invitación fue revertida.' })
  }
  return response(request, 201, { user: { id: invited.user.id, email, full_name: fullName, role, is_active: true } })
})
