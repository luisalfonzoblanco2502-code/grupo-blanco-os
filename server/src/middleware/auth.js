import { supabase } from "../supabaseClient.js";
import { prisma } from "../db.js";

// Verifica el JWT de Supabase Auth (llamando a Supabase, no validando localmente
// — evita depender del JWT secret y funciona igual si Supabase rota sus claves).
// Carga el perfil de negocio (usuarios) y lo cuelga en req.usuario.
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "No autenticado" });
    }

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: "Sesión inválida o expirada" });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { authUserId: data.user.id },
      include: { empresa: true, rol: true, puesto: true },
    });

    if (!usuario) {
      return res.status(403).json({ error: "Este usuario no tiene perfil en el sistema" });
    }
    if (!usuario.activo) {
      return res.status(403).json({ error: "Usuario inactivo" });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}
