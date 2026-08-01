// Rutas del Facturador Administrativo Inteligente: Catálogo Interno de
// Productos, Inventario, CRM, Costos e Indicadores — todo sobre tablas
// reales (ver server/prisma/migrations_manual/0002_facturador_administrativo.sql).
// Gateadas temporalmente con "ver_dashboard_ejecutivo" hasta que existan
// permisos propios (mismo criterio ya documentado en nav/modules.js del cliente).
import { Router } from "express";
import { requirePermiso } from "../middleware/permisos.js";
import { NoEncontradoError, ValidacionError } from "../services/errors.js";
import { listarDocumentosVenta, obtenerDocumentoPorPedido } from "../services/administracion.service.js";
import {
  listarItemsInventario,
  crearItemInventario,
  actualizarItemInventario,
  registrarEntrada,
  listarMovimientos,
  calcularAlertas,
} from "../services/itemsInventario.service.js";
import {
  listarProductosInternos,
  obtenerProductoInterno,
  crearProductoInterno,
  actualizarProductoInterno,
  agregarInsumo,
  quitarInsumo,
} from "../services/productosInternos.service.js";
import { listarFichasClientes, obtenerFichaCliente } from "../services/crm.service.js";
import { listarCostos, obtenerCostosPedido } from "../services/costos.service.js";
import { obtenerIndicadores } from "../services/indicadoresFacturacion.service.js";
import { listarCajasCuentas, crearCajaCuenta } from "../services/cajasCuentas.service.js";

export const nucleoFacturacionRouter = Router();
const gate = requirePermiso("ver_dashboard_ejecutivo");

function manejar(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof NoEncontradoError || err instanceof ValidacionError) {
        return res.status(err.statusCode).json({ error: err.message });
      }
      next(err);
    }
  };
}

// --- Documentos de venta ---
nucleoFacturacionRouter.get(
  "/documentos",
  gate,
  manejar(async (req, res) => res.json(await listarDocumentosVenta(req.usuario.empresaId)))
);
nucleoFacturacionRouter.get(
  "/documentos/:pedidoId",
  gate,
  manejar(async (req, res) => res.json(await obtenerDocumentoPorPedido(req.params.pedidoId, req.usuario.empresaId)))
);

// --- Inventario (materia prima) ---
nucleoFacturacionRouter.get(
  "/inventario/items",
  gate,
  manejar(async (req, res) => res.json(await listarItemsInventario(req.usuario.empresaId)))
);
nucleoFacturacionRouter.get(
  "/inventario/alertas",
  gate,
  manejar(async (req, res) => res.json(calcularAlertas(await listarItemsInventario(req.usuario.empresaId))))
);
nucleoFacturacionRouter.get(
  "/inventario/movimientos",
  gate,
  manejar(async (req, res) => res.json(await listarMovimientos(req.usuario.empresaId)))
);
nucleoFacturacionRouter.post(
  "/inventario/items",
  gate,
  manejar(async (req, res) => res.status(201).json(await crearItemInventario(req.usuario.empresaId, req.body)))
);
nucleoFacturacionRouter.patch(
  "/inventario/items/:id",
  gate,
  manejar(async (req, res) =>
    res.json(await actualizarItemInventario(req.params.id, req.usuario.empresaId, req.body))
  )
);
nucleoFacturacionRouter.post(
  "/inventario/items/:id/entrada",
  gate,
  manejar(async (req, res) =>
    res.json(
      await registrarEntrada(req.params.id, req.usuario.empresaId, { ...req.body, usuarioId: req.usuario.id })
    )
  )
);

// --- Catálogo Interno de Productos (BOM) ---
nucleoFacturacionRouter.get(
  "/productos-internos",
  gate,
  manejar(async (req, res) => res.json(await listarProductosInternos(req.usuario.empresaId)))
);
nucleoFacturacionRouter.get(
  "/productos-internos/:id",
  gate,
  manejar(async (req, res) => res.json(await obtenerProductoInterno(req.params.id, req.usuario.empresaId)))
);
nucleoFacturacionRouter.post(
  "/productos-internos",
  gate,
  manejar(async (req, res) => res.status(201).json(await crearProductoInterno(req.usuario.empresaId, req.body)))
);
nucleoFacturacionRouter.patch(
  "/productos-internos/:id",
  gate,
  manejar(async (req, res) =>
    res.json(await actualizarProductoInterno(req.params.id, req.usuario.empresaId, req.body))
  )
);
nucleoFacturacionRouter.post(
  "/productos-internos/:id/insumos",
  gate,
  manejar(async (req, res) => res.status(201).json(await agregarInsumo(req.params.id, req.usuario.empresaId, req.body)))
);
nucleoFacturacionRouter.delete(
  "/productos-internos/insumos/:insumoId",
  gate,
  manejar(async (req, res) => {
    await quitarInsumo(req.params.insumoId, req.usuario.empresaId);
    res.status(204).end();
  })
);

// --- CRM ---
nucleoFacturacionRouter.get(
  "/crm/clientes",
  gate,
  manejar(async (req, res) => res.json(await listarFichasClientes(req.usuario.empresaId)))
);
nucleoFacturacionRouter.get(
  "/crm/clientes/:id",
  gate,
  manejar(async (req, res) => res.json(await obtenerFichaCliente(req.params.id, req.usuario.empresaId)))
);

// --- Costos ---
nucleoFacturacionRouter.get(
  "/costos",
  gate,
  manejar(async (req, res) => res.json(await listarCostos(req.usuario.empresaId)))
);
nucleoFacturacionRouter.get(
  "/costos/:pedidoId",
  gate,
  manejar(async (req, res) => res.json(await obtenerCostosPedido(req.params.pedidoId, req.usuario.empresaId)))
);

// --- Indicadores ---
nucleoFacturacionRouter.get(
  "/indicadores",
  gate,
  manejar(async (req, res) => res.json(await obtenerIndicadores(req.usuario.empresaId)))
);

// --- Cajas/cuentas ---
nucleoFacturacionRouter.get(
  "/cajas-cuentas",
  gate,
  manejar(async (req, res) => res.json(await listarCajasCuentas(req.usuario.empresaId)))
);
nucleoFacturacionRouter.post(
  "/cajas-cuentas",
  gate,
  manejar(async (req, res) => res.status(201).json(await crearCajaCuenta(req.usuario.empresaId, req.body)))
);
