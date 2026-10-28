import { Router } from 'express';
import { getBalance } from './wallet.controller.js';
// Importaremos el middleware del Rol 2 cuando esté listo. 
// Por ahora asume que inyecta req.user.id_usuario
import { requireAuth } from '../../middlewares/auth.middleware.js'; 

const router = Router();

router.get('/balance', requireAuth, getBalance);

export default router;