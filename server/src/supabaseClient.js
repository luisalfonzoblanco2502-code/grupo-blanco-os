import { createClient } from "@supabase/supabase-js";

// Cliente usado únicamente para verificar tokens de sesión de usuarios
// (auth.getUser(token)) — no para leer/escribir tablas (eso lo hace Prisma).
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
