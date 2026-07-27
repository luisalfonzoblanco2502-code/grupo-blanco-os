// Catálogo local — fuente de datos para el lanzamiento de hoy (ver
// VITE_DATA_SOURCE=local en .env). Mismo shape que devuelve la API real
// (GET /api/publico/productos) para que api.js pueda intercambiar la fuente
// sin que ningún componente se entere.
//
// CÓMO COMPLETAR CADA DISEÑO (los 6 de abajo son plantilla, no datos reales):
//   1. `nombre`   -> nombre real del diseño (lo ve el cliente).
//   2. `precioBase` -> precio en la moneda que uses, sin símbolo (ej. 8.5).
//   3. `imagenUrl` -> ya apunta al archivo esperado en
//      catalogo/public/productos/pan-00X.jpg — solo tenés que poner el
//      archivo con ESE nombre exacto ahí (ver instrucciones en README.md).
//      Si un diseño todavía no tiene foto, dejalo en `null` (muestra un
//      recuadro vacío, no un ícono roto).
//   4. `preciosVolumen` es opcional — dejalo `[]` si no hay descuento por
//      cantidad para ese diseño, o agregá escalones como en el ejemplo.
//   5. Para agregar un 7mo diseño: copiá un bloque entero, cambiá `id`,
//      `codigo` (ej. PAN-007) y el nombre del archivo de imagen a juego
//      (pan-007.jpg).
// Guardá, hacé commit y `npx vercel --prod` de nuevo — el enlace público
// NO cambia.
export const productosLocal = [
  {
    id: "local-1",
    codigo: "PAN-001",
    nombre: "Diseño 01 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    imagenUrl: "/productos/pan-001.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [],
  },
  {
    id: "local-2",
    codigo: "PAN-002",
    nombre: "Diseño 02 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    imagenUrl: "/productos/pan-002.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [],
  },
  {
    id: "local-3",
    codigo: "PAN-003",
    nombre: "Diseño 03 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    imagenUrl: "/productos/pan-003.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [],
  },
  {
    id: "local-4",
    codigo: "PAN-004",
    nombre: "Diseño 04 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    imagenUrl: "/productos/pan-004.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [],
  },
  {
    id: "local-5",
    codigo: "PAN-005",
    nombre: "Diseño 05 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    imagenUrl: "/productos/pan-005.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [],
  },
  {
    id: "local-6",
    codigo: "PAN-006",
    nombre: "Diseño 06 (completar nombre real)",
    categoria: "panoleta",
    descripcion: "",
    // Ejemplo de escalón de precio por volumen — borralo si no aplica:
    imagenUrl: "/productos/pan-006.jpg",
    precioBase: 0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [{ id: "v1", cantidadMinima: 12, precioUnitario: 0 }],
  },
];
