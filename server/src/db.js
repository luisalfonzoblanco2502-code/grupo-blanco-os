import { PrismaClient } from "@prisma/client";
import { contextoRequest } from "./instrumentacion.js";

const prismaBase = new PrismaClient();

// Extensión mínima solo para sumar cuánto tiempo pasa cada consulta —
// no cambia el comportamiento de ninguna query, solo mide. Si no hay un
// request HTTP en curso (ej. scripts de prueba), contextoRequest.getStore()
// da undefined y simplemente no mide nada.
export const prisma = prismaBase.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const inicio = process.hrtime.bigint();
        const resultado = await query(args);
        const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
        const contexto = contextoRequest.getStore();
        if (contexto) {
          contexto.prismaMs += ms;
          contexto.prismaConsultas += 1;
        }
        return resultado;
      },
    },
  },
});

// Nuestra conexión pasa por el pooler de Supabase + VPN, con más latencia
// que una red local. Medido en Sprint 9: un editarPedido (2 escrituras, ~5
// round-trips) tardó 12.4s de punta a punta — muy cerca del límite anterior
// de 15s. FacturacionService, con más round-trips por línea, puede
// necesitar más. 30s da margen real; sigue siendo una cifra que habría que
// bajar el día que esta conexión no dependa de la VPN (ver Riesgos Técnicos).
export const TRANSACTION_OPTIONS = { timeout: 30000, maxWait: 15000 };
