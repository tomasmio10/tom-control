# admin-users

Edge Function administrativa para listar usuarios e invitar nuevos integrantes.

## Configuración

1. Configurar `APP_URL` con la URL pública permitida:

   `supabase secrets set APP_URL=https://tom-control.tomasmio1000.workers.dev`

2. Añadir en Supabase Auth → URL Configuration la URL de redirección:

   `https://tom-control.tomasmio1000.workers.dev/establecer-contrasena`

3. Desplegar:

   `supabase functions deploy admin-users`

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` son secretos disponibles en el entorno administrado de Edge Functions. Nunca deben agregarse al frontend.
