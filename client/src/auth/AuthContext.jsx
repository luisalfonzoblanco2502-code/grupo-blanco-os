import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { api } from "../api/client";

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function cargarPerfil(accessToken) {
  const res = await fetch(`${API_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) {
    const err = new Error("Sesión inválida o expirada");
    err.sesionInvalida = true;
    throw err;
  }
  if (!res.ok) throw new Error("No se pudo cargar el perfil del usuario");
  return res.json();
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [perfil, setPerfil] = useState(null); // { empresa, rol, puesto, permisos, nombre, ... }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const sincronizarPerfil = useCallback(async (nuevaSesion) => {
    if (!nuevaSesion) {
      setPerfil(null);
      return;
    }
    try {
      const data = await cargarPerfil(nuevaSesion.access_token);
      setPerfil(data);
      setError(null);
    } catch (err) {
      setPerfil(null);
      if (err.sesionInvalida) {
        // El token ya no sirve (revocado/expirado) — no tiene sentido dejar
        // al usuario "logueado" viendo pantallas rotas. Cerramos la sesión
        // local; onAuthStateChange pone session en null y ProtectedRoute
        // redirige a /login solo.
        await supabase.auth.signOut();
      } else {
        // Error de red/servidor real (no es un problema de sesión) — no se
        // fuerza logout para no expulsar al usuario por un fallo transitorio.
        setError(err.message);
      }
    }
  }, []);

  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(async ({ data: { session: sesionActual } }) => {
      if (!activo) return;
      setSession(sesionActual);
      await sincronizarPerfil(sesionActual);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nuevaSesion) => {
      if (!activo) return;
      setSession(nuevaSesion);
      await sincronizarPerfil(nuevaSesion);
    });

    return () => {
      activo = false;
      listener.subscription.unsubscribe();
    };
  }, [sincronizarPerfil]);

  async function signIn(email, password) {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    // No debe bloquear el login si falla (es solo auditoría/evento interno).
    api.registrarLogin().catch(() => {});
  }

  async function signOut() {
    // Se registra ANTES de cerrar sesión: una vez hecho signOut el token
    // deja de servir para autenticar la llamada al backend.
    await api.registrarLogout().catch(() => {});
    await supabase.auth.signOut();
  }

  const value = { session, perfil, loading, error, signIn, signOut };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
