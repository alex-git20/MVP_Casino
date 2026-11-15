import { Router } from 'express';
import { 
  getUsers, 
  toggleUserStatus, 
  getWithdrawals, 
  resolveWithdrawal 
} from '../admin/admin.controller.js';
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas están doblemente protegidas
router.use(requireAuth, requireAdmin);

// Rutas de Usuarios (Fase 2)
router.get('/users', getUsers);
router.patch('/users/:id/status', toggleUserStatus);

// Rutas de Retiros (Fase 3)
router.get('/withdrawals', getWithdrawals);
router.patch('/withdrawals/:id/resolve', resolveWithdrawal);

export default router;