import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

//Monitoreo de errores en clientes inactivos
pool.on('error', (err, client) => {
    console.error('Error inesperado en el pool de PostgreSQL', err);
    process.exit(-1);
});

// Envolvemos query para usar parámetros automáticamente ($1, $2, etc.)
export const query = (text, params) => pool.query(text, params);

// Exportamos el pool completo para cuando necesitemos transacciones (BEGIN, COMMIT, ROLLBACK)
export { pool };