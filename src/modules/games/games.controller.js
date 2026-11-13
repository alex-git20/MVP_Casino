// games.controller.js
// Capa HTTP: lee la petición, llama al servicio y responde en el formato estándar.
import * as gamesService from './games.services.js';

const { crearError } = gamesService;

// Errores conocidos (con .status) se devuelven tal cual; los inesperados se registran
// y se responde un 500 genérico para no exponer detalles internos (ej. errores de SQL).
function responderError(res, error) {
  if (error.status) {
    return res.status(error.status).json({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }
  console.error('[Games Controller Error]:', error);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocurrió un error inesperado en el módulo de juegos.' },
  });
}

function leerId(valor, nombre) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) {
    throw crearError('PARAMETRO_INVALIDO', `El parámetro '${nombre}' debe ser un entero positivo.`);
  }
  return id;
}

// GET /api/games
export const getJuegos = async (req, res) => {
  try {
    const juegos = await gamesService.listarJuegos();
    res.status(200).json({ success: true, data: juegos });
  } catch (error) {
    responderError(res, error);
  }
};

// GET /api/games/:id/tipos-apuesta
export const getTiposApuesta = async (req, res) => {
  try {
    const idJuego = leerId(req.params.id, 'id');
    const tipos = await gamesService.listarTiposApuesta(idJuego);
    res.status(200).json({ success: true, data: tipos });
  } catch (error) {
    responderError(res, error);
  }
};

// GET /api/games/:id/ronda-actual
export const getRondaActual = async (req, res) => {
  try {
    const idJuego = leerId(req.params.id, 'id');
    const ronda = await gamesService.obtenerRondaAbierta(idJuego);
    res.status(200).json({ success: true, data: ronda }); // data = null si no hay ronda abierta
  } catch (error) {
    responderError(res, error);
  }
};

// POST /api/games/apuesta
// Body: { id_ronda, id_tipo_apuesta, monto, seleccion }
export const postApuesta = async (req, res) => {
  try {
    const { id_ronda, id_tipo_apuesta, monto, seleccion } = req.body ?? {};
    const apuesta = await gamesService.realizarApuesta({
      idUsuario: req.user.id_usuario, // lo pone requireAuth desde el JWT
      idRonda: leerId(id_ronda, 'id_ronda'),
      idTipoApuesta: leerId(id_tipo_apuesta, 'id_tipo_apuesta'),
      monto,
      seleccion: seleccion ?? {},
    });
    res.status(201).json({ success: true, data: apuesta });
  } catch (error) {
    responderError(res, error);
  }
};

// GET /api/games/mis-apuestas?page=1&limit=20
export const getMisApuestas = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;
    const historial = await gamesService.listarMisApuestas(req.user.id_usuario, limit, offset);
    res.status(200).json({ success: true, data: historial });
  } catch (error) {
    responderError(res, error);
  }
};

// POST /api/games/rondas/abrir   Body: { id_juego }
export const postAbrirRonda = async (req, res) => {
  try {
    const ronda = await gamesService.abrirRonda(leerId(req.body?.id_juego, 'id_juego'));
    res.status(201).json({ success: true, data: ronda });
  } catch (error) {
    responderError(res, error);
  }
};

// POST /api/games/rondas/cerrar  Body: { id_ronda }
// Cierra (genera el número ganador) y luego liquida. Si la liquidación falla,
// la ronda queda 'cerrada' y se puede reintentar con /rondas/liquidar.
export const postCerrarRonda = async (req, res) => {
  try {
    const idRonda = leerId(req.body?.id_ronda, 'id_ronda');
    await gamesService.cerrarRonda(idRonda);
    const liquidacion = await gamesService.liquidarRonda(idRonda);
    res.status(200).json({ success: true, data: liquidacion });
  } catch (error) {
    responderError(res, error);
  }
};

// POST /api/games/rondas/liquidar  Body: { id_ronda }  (reintento de liquidación)
export const postLiquidarRonda = async (req, res) => {
  try {
    const liquidacion = await gamesService.liquidarRonda(leerId(req.body?.id_ronda, 'id_ronda'));
    res.status(200).json({ success: true, data: liquidacion });
  } catch (error) {
    responderError(res, error);
  }
};

