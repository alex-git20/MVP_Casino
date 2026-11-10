import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
  getJuegos,
  getTiposApuesta,
  getRondaActual,
  postApuesta,
  getMisApuestas,
  postAbrirRonda,
  postCerrarRonda,
  postLiquidarRonda,
} from './games.controller.js';

const router = Router();

// Catálogo (público)
router.get('/', getJuegos);
router.get('/:id/tipos-apuesta', getTiposApuesta);
router.get('/:id/ronda-actual', getRondaActual);

// Jugador (requiere JWT)
router.post('/apuesta', requireAuth, postApuesta);
router.get('/mis-apuestas', requireAuth, getMisApuestas);

// Gestión de rondas (pruebas/admin). Por ahora solo exige JWT; falta restringir a admin.
router.post('/rondas/abrir', requireAuth, postAbrirRonda);
router.post('/rondas/cerrar', requireAuth, postCerrarRonda);
router.post('/rondas/liquidar', requireAuth, postLiquidarRonda);

export default router;
