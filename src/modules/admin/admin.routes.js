import { Router } from 'express';
import { 
  getUsers, 
  toggleUserStatus, 
  getWithdrawals, 
  resolveWithdrawal,
  getGlobalTransactions,
  getDashboardStats
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

router.get('/transactions', getGlobalTransactions);

router.get('/kpis', getDashboardStats);

export default router;