import { Router } from 'express';
import { getBalance, handleStripeWebhook } from './wallet.controller.js'; // Necesario para handleStripeWebhook
// Importaremos el middleware del Rol 2 cuando esté listo. 
// Por ahora asume que inyecta req.user.id_usuario
import { requireAuth } from '../../middlewares/auth.middleware.js'; 

const router = Router();

router.get('/balance', requireAuth, getBalance);

// Ruta del webhook: Debe usar express.raw() ANTES del parseo JSON
router.post('/webhook-stripe',handleStripeWebhook);

export default router;