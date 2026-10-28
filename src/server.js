import app from './app.js';
import { query } from './config/db.js';
import { config } from './config/env.js';

async function startServer() {
    try {
        // Validamos la conexion a la base de datos antes de exponer el servidor
        const res = await query('SELECT NOW()');
        console.log('Conexion a PostgreSQL exitosa:', res.rows[0].now);

        app.listen(config.port, () => {
            console.log(`Servidor corriendo en el puerto ${config.port}`);
        })
    } catch (error) {
        console.error('Error fatal: No se pudo conectar a la base de datos:', error.message);
        process.exit(1);
    }
}

startServer();