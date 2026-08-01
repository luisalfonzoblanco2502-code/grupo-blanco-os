// Núcleo de Facturación Administrativa — módulo CRM.
//
// Reacciona a PEDIDO_FACTURADO únicamente para garantizar que la ficha del
// Cliente exista (find-or-create, ver clientes.service.js — misma función
// que usa Administración para completar documentoVenta.clienteId, no hay
// dependencia entre listeners, ambos llaman al mismo helper compartido).
//
// Deliberadamente esto NO mantiene contadores (totalComprado,
// cantidadPedidos, ticketPromedio, clasificación): esos se calculan en
// tiempo de lectura agregando DocumentoVenta (ver clientes.service.js). Es
// una desviación consciente de "un contador por evento" — evita que
// reprocesar PEDIDO_FACTURADO pueda duplicar el conteo de un cliente, sin
// necesitar una idempotencia propia para esos números.
import { on } from "../events/eventBus.js";
import { PEDIDO_FACTURADO } from "../events/eventos.js";
import { obtenerOCrearCliente } from "./clientes.service.js";

async function asegurarFichaCliente({ tx, pedido, empresaId }) {
  try {
    if (!pedido.clienteNombre) return;
    await obtenerOCrearCliente(tx, empresaId, pedido.clienteNombre);
  } catch (err) {
    console.error("[crm] error asegurando ficha de cliente (no bloquea la facturación):", err);
  }
}

on(PEDIDO_FACTURADO, asegurarFichaCliente);

export { listarFichasClientes, obtenerFichaCliente } from "./clientes.service.js";
