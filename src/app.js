import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; // Protege sentando cabeceras HTTP de seguridad

// Importación de rutas modulares 
import walletRoutes from './modules/wallet/wallet.routes.js'; // Módulo financiero

// Importacion del middleware de errores global
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(helmet());
app.use(cors());

// 1. EXCEPCIÓN PARA STRIPE: Extraemos el body en crudo solo para esta ruta exacta
app.use('/api/wallet/webhook-stripe', express.raw({ type: 'application/json' }));

// 2. PARSEO GLOBAL: Para todas las demás rutas del casino, parseamos a JSON normalmente
app.use(express.json()); // Necesario para parsear el body de los webhoooks de Stripe

// Ruta basica de salud para comprobar que la API responde
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'casino API operativa' });
});

//Montaje de Modulos Independientes
app.use('/api/wallet', walletRoutes); //  Modulo Financiero y Billetera 
// app.use('/api/auth', authRoutes);  // Pendiente  Módulo de Autenticación Rol 2
// app.use('/api/games', gamesRoutes); // Pendiente Módulo de Juegos y Apuestas Rol 3

// IMPORTANTE: El middleware de errores siempre debe ser el último `app.use`
app.use(errorHandler);

export default app;