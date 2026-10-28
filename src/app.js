import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; // Protege sentando cabeceras HTTP de seguridad

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json()); // Necesario para parsear el body de los webhoooks de Stripe

// Ruta basica de salud para comprobar que la API responde
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'casino API operativa' });
});

export default app;