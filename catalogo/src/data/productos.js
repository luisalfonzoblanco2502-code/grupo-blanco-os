// Catálogo local temporal — fuente de datos mientras Supabase no está
// conectado (ver VITE_DATA_SOURCE en .env). Mismo shape que devuelve la API
// real (`GET /api/publico/productos`) para que api.js pueda intercambiar la
// fuente sin que ningún componente se entere.
//
// CÓMO AGREGAR / EDITAR PRODUCTOS (sin tocar código):
//   1. Copiá un objeto de abajo y cambiá sus valores.
//   2. `codigo` es el código interno que se muestra al cliente (ej. PAN-001)
//      — todavía no existe en el modelo Producto de Supabase, es exclusivo
//      de este catálogo temporal (ver nota de deuda técnica en README).
//   3. `imagenUrl`: subí el archivo a catalogo/public/productos/ y poné acá
//      la ruta "/productos/archivo.jpg". Si lo dejás en null se muestra un
//      recuadro vacío en vez de un ícono de imagen rota.
//   4. `preciosVolumen` es opcional — si no aplica descuento por cantidad,
//      dejá el array vacío `[]`.
//   5. Guardá, hacé commit y volvé a desplegar (`vercel --prod` desde
//      catalogo/) — el enlace público NO cambia.
export const productosLocal = [
  {
    id: "local-1",
    codigo: "PAN-001",
    nombre: "Pañoleta Flores Tropicales",
    categoria: "panoleta",
    descripcion: "Sublimado full color, tela microfibra 90x90cm.",
    imagenUrl: null,
    precioBase: 8.5,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [
      { id: "v1", cantidadMinima: 12, precioUnitario: 7.5 },
      { id: "v2", cantidadMinima: 24, precioUnitario: 6.8 },
    ],
  },
  {
    id: "local-2",
    codigo: "PAN-002",
    nombre: "Pañoleta Geométrica Azul",
    categoria: "panoleta",
    descripcion: "Sublimado full color, tela microfibra 90x90cm.",
    imagenUrl: null,
    precioBase: 8.5,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [
      { id: "v1", cantidadMinima: 12, precioUnitario: 7.5 },
      { id: "v2", cantidadMinima: 24, precioUnitario: 6.8 },
    ],
  },
  {
    id: "local-3",
    codigo: "PAN-003",
    nombre: "Pañoleta Animal Print",
    categoria: "panoleta",
    descripcion: "Sublimado full color, tela microfibra 90x90cm.",
    imagenUrl: null,
    precioBase: 9.0,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [{ id: "v1", cantidadMinima: 12, precioUnitario: 8.0 }],
  },
  {
    id: "local-4",
    codigo: "PAN-004",
    nombre: "Pañoleta Diseño Personalizado",
    categoria: "panoleta",
    descripcion: "Enviá tu logo o diseño — te contactamos para confirmar el arte.",
    imagenUrl: null,
    precioBase: 9.5,
    activo: true,
    publicadoCatalogo: true,
    preciosVolumen: [{ id: "v1", cantidadMinima: 12, precioUnitario: 8.5 }],
  },
];
