import dotenv from 'dotenv';
import app from './src/app.js';
import { query } from './src/config/db.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Validamos la conexion a la base de datos antes de exponer el servidor
        const res = await query('SELECT NOW()');
        console.log('Conexion a PostgreSQL exitosa:', res.rows[0].now);

        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        })
    } catch (error) {
        console.error('Error fatal: No se pudo conectar a la base de datos:', error.message);
        process.exit(1);
    }
}

startServer();