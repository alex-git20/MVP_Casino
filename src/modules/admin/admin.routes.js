import { Router } from 'express';
import { getUsers, toggleUserStatus } from './admin.controller.js';
import { requireAuth, requireAdmin } from '../../middlewares/auth.middleware.js';

const router = Router();

// Todas las rutas de administración están doblemente protegidas
router.use(requireAuth, requireAdmin);

// GET /api/admin/users?search=juan&page=1
router.get('/users', getUsers);

// PATCH /api/admin/users/:id/status
router.patch('/users/:id/status', toggleUserStatus);

export default router;