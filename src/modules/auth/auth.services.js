import { pool } from '../../config/db.js';

import bcrypt from 'bcrypt'; 

export const registerUser = async ({ username, email, password, fecha_nacimiento }) => {
  const client = await pool.connect();

  try {
    // 1. Iniciar transacción ACID
    await client.query('BEGIN');

    // 2. Hashear la contraseña por seguridad
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 3. Insertar el usuario (Evitando SQL Injection con $1, $2...)
    const insertUserQuery = `
      INSERT INTO usuario (id_rol, username, email, password_hash, fecha_nacimiento)
      VALUES (
        (SELECT id_rol FROM rol WHERE nombre = 'jugador'), 
        $1, $2, $3, $4
      )
      RETURNING id_usuario, username, email, fecha_nacimiento, fecha_registro;
    `;
    const userValues = [username, email, passwordHash, fecha_nacimiento];
    const userResult = await client.query(insertUserQuery, userValues);
    const newUser = userResult.rows[0];

    // 4. Inicializar la billetera en cero vinculada al usuario
    const insertWalletQuery = `
      INSERT INTO billetera (id_usuario, saldo_real, saldo_bono)
      VALUES ($1, 0.00, 0.00)
      RETURNING id_billetera, saldo_real, saldo_bono;
    `;
    const walletResult = await client.query(insertWalletQuery, [newUser.id_usuario]);
    const newWallet = walletResult.rows[0];

    // 5. Confirmar transacción
    await client.query('COMMIT');

    // Retornamos la confirmación exacta que exige el contrato
    return {
      usuario: newUser,
      billetera: newWallet
    };

  } catch (error) {
    // Si algo falla (ej. email duplicado), deshacemos todo
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Liberar el cliente al pool
    client.release();
  }
};