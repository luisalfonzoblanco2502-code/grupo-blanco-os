import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

// Mensaje de éxito/error breve tras una operación (Release Candidate 2,
// prioridad 8). Un solo mecanismo compartido en vez de que cada pantalla
// invente su propio aviso — se llama con mostrarToast("texto") desde
// cualquier página.
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timeoutRef = useRef(null);

  const mostrarToast = useCallback((mensaje, tipo = "exito") => {
    clearTimeout(timeoutRef.current);
    setToast({ mensaje, tipo });
    timeoutRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ mostrarToast }}>
      {children}
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            padding: "0.75rem 1.25rem",
            borderRadius: "8px",
            fontWeight: 600,
            color: toast.tipo === "error" ? "#fff" : "#0b0f1a",
            background: toast.tipo === "error" ? "#dc2626" : "#22c55e",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            zIndex: 1000,
            maxWidth: "24rem",
          }}
        >
          {toast.mensaje}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}
