const PALETA = ["#2554c7", "#0284c7", "#7c3aed", "#c2410c", "#15803d", "#be185d", "#4338ca", "#b45309"];

function colorPara(texto) {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA[Math.abs(hash) % PALETA.length];
}

function iniciales(nombre) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

// Identidad visual consistente de una persona en todo el sistema: mismo color
// para el mismo nombre en cualquier pantalla (avatar-por-hash, sin depender
// de una foto de perfil que no existe hoy en el modelo de Usuario).
export function Avatar({ nombre, tamano = 1.8, conNombre = false, cargo }) {
  if (!nombre) {
    return conNombre ? <span style={{ color: "var(--text-faint)" }}>Sin asignar</span> : null;
  }
  const estilo = {
    width: `${tamano}rem`,
    height: `${tamano}rem`,
    fontSize: `${tamano * 0.4}rem`,
    background: colorPara(nombre),
  };

  if (!conNombre) {
    return (
      <span className="avatar" style={estilo} title={nombre}>
        {iniciales(nombre)}
      </span>
    );
  }

  return (
    <span className="avatar-grupo">
      <span className="avatar" style={estilo}>
        {iniciales(nombre)}
      </span>
      <span className="avatar-nombre">
        <span>{nombre}</span>
        {cargo && <span className="avatar-nombre-cargo">{cargo}</span>}
      </span>
    </span>
  );
}
