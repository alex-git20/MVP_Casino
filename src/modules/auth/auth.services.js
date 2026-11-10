import { pool } from '../../config/db.js';
import bcrypt from 'bcrypt'; 
import jwt from 'jsonwebtoken';

export const registerUser = async ({ username, email, password, fecha_nacimiento }) => {

  // 1. ESCUDO DE VALIDACIÓN (Reglas del Casino)
    
  // A. Validar longitud de contraseña
  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }

  // B. Validar mayoría de edad (18+ años)
  const fechaNac = new Date(fecha_nacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - fechaNac.getFullYear();
  const mes = hoy.getMonth() - fechaNac.getMonth();
  
  // Si aún no ha pasado su mes de cumpleaños, o si es el mes pero no ha llegado el día, restamos 1 año
  if (mes < 0 || (mes === 0 && hoy.getDate() < fechaNac.getDate())) {
    edad--;
  }

  if (edad < 18) {
    throw new Error('Debes ser mayor de 18 años para registrarte en el casino.');
  }
  // ==========================================

  const client = await pool.connect();

  try {
    // 2. Iniciar transacción ACID
    await client.query('BEGIN');

    // 3. Hashear la contraseña por seguridad
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Insertar el usuario (Evitando SQL Injection con $1, $2...)
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

    // 5. Inicializar la billetera en cero vinculada al usuario
    const insertWalletQuery = `
      INSERT INTO billetera (id_usuario, saldo_real, saldo_bono)
      VALUES ($1, 0.00, 0.00)
      RETURNING id_billetera, saldo_real, saldo_bono;
    `;
    const walletResult = await client.query(insertWalletQuery, [newUser.id_usuario]);
    const newWallet = walletResult.rows[0];

    // 6. Confirmar transacción
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

export const loginUser = async ({ email, password }) => {
  // 1. Buscar al usuario (usamos $1 para evitar SQL Injection)
  const query = `
    SELECT id_usuario, id_rol, password_hash 
    FROM usuario 
    WHERE email = $1;
  `;
  const result = await pool.query(query, [email]);
  
  if (result.rows.length === 0) {
    throw new Error('Correo o contraseña incorrectos');
  }

  const user = result.rows[0];

  // 2. Verificar que la contraseña coincida con el hash
  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new Error('Correo o contraseña incorrectos');
  }

  // 3. Generar el JWT incluyendo los datos necesarios para el futuro middleware
  const jwtSecret = process.env.JWT_SECRET || 'casino_secret_key_temporal';
  const token = jwt.sign(
    { id_usuario: user.id_usuario, id_rol: user.id_rol },
    jwtSecret,
    { expiresIn: '8h' }
  );

  return token;
};