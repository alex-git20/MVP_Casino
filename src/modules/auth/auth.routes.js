import { Router } from 'express';
import * as authController from './auth.controller.js';

const router = Router();

// Endpoint para registro: Recibe username, email, password, fecha_nacimiento
router.post('/register', authController.register);

// Endpoint para login: Recibe email, password
router.post('/login', authController.login);

export default router;
