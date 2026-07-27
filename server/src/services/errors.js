// Errores de dominio compartidos por todos los servicios. El handler global
// de errores en index.js ya responde usando err.statusCode, así que los
// controladores no necesitan un catch particular para cada uno de estos:
// basta con `next(err)`.
export class ValidacionError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "ValidacionError";
    this.statusCode = 400;
  }
}

export class NoEncontradoError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "NoEncontradoError";
    this.statusCode = 404;
  }
}

export class PermisoDenegadoError extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "PermisoDenegadoError";
    this.statusCode = 403;
  }
}
