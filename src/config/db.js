import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
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