// ÚNICO archivo que hay que tocar para administrar el catálogo mientras
// está en modo local (VITE_DATA_SOURCE=local). Por cada diseño solo hacen
// falta 4 datos — nada de código ni JSON anidado:
//
//   codigo  -> el código que ve el cliente (ej. "PAN-001").
//   nombre  -> nombre real del diseño.
//   precio  -> número, sin símbolo de moneda (ej. 8.5).
//   imagen  -> nombre EXACTO del archivo dentro de catalogo/public/productos/
//              (ej. "pan-001.jpg"). Si todavía no tenés la foto, dejalo en
//              null — se muestra un recuadro vacío, nunca un ícono roto.
//
// Para agregar un diseño nuevo: copiá un bloque, pegalo antes del `];` de
// abajo y completá los 4 datos. Para sacar uno: borrá su bloque entero.
// Guardá, `git add`/`commit` y `npx vercel --prod` de nuevo desde
// catalogo/ — el enlace público NO cambia.
export const productosLocal = [
  { codigo: "PAN-001", nombre: "Pañoleta Diseño 01", precio: 8.5, imagen: null },
  { codigo: "PAN-002", nombre: "Pañoleta Diseño 02", precio: 8.5, imagen: null },
  { codigo: "PAN-003", nombre: "Pañoleta Diseño 03", precio: 8.5, imagen: null },
  { codigo: "PAN-004", nombre: "Pañoleta Diseño 04", precio: 8.5, imagen: null },
  { codigo: "PAN-005", nombre: "Pañoleta Diseño 05", precio: 8.5, imagen: null },
  { codigo: "PAN-006", nombre: "Pañoleta Diseño 06", precio: 8.5, imagen: null },
];
