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

  const callerClient = createClient(supabaseUrl, publishableKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) return response(request, 401, { error: 'La sesión no es válida o expiró.' })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile, error: profileError } = await adminClient.from('profiles').select('role, is_active').eq('id', callerData.user.id).single()
  if (profileError || profile?.role !== 'admin' || !profile.is_active) return response(request, 403, { error: 'Solo un administrador activo puede gestionar usuarios.' })

  if (request.method === 'GET') {
    const [{ data: authData, error: authError }, { data: profiles, error: profilesError }] = await Promise.all([
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      adminClient.from('profiles').select('id, full_name, role, is_active'),
    ])
    if (authError || profilesError) return response(request, 500, { error: 'No fue posible consultar los usuarios registrados.' })
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

  const { error: upsertError } = await adminClient.from('profiles').upsert({ id: invited.user.id, full_name: fullName, role, is_active: true }, { onConflict: 'id' })
  if (upsertError) {
    await adminClient.auth.admin.deleteUser(invited.user.id)
    return response(request, 500, { error: 'No fue posible crear el perfil. La invitación fue revertida.' })
  }
  return response(request, 201, { user: { id: invited.user.id, email, full_name: fullName, role, is_active: true } })
})
