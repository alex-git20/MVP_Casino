import { Router } from 'express';
import { getBalance, handleStripeWebhook, createDepositIntent, requestWithdrawal, getHistory } from './wallet.controller.js'; // Necesario para handleStripeWebhook
import { requireAuth } from '../../middlewares/auth.middleware.js'; 

const router = Router();

router.get('/balance', requireAuth, getBalance);

// Ruta historial de transacciones
router.get('/history', requireAuth, getHistory);

// Ruta el frontend llama aquí para iniciar el pago
router.post('/deposit', requireAuth, createDepositIntent);

// Ruta de la Solicitud de retiro
router.post('/withdraw', requireAuth, requestWithdrawal);

// Ruta del webhook: Debe usar express.raw() ANTES del parseo JSON
router.post('/webhook-stripe',handleStripeWebhook);

export default router;