import { query, pool } from '../../config/db.js';
import Stripe from 'stripe';
import { config } from '../../config/env.js';

const stripe = new Stripe(config.stripe.secretKey);

export const getUserBalance = async (userId) => {
  const sql = `
    SELECT saldo_real, saldo_bono 
    FROM billetera 
    WHERE id_usuario = $1
  `;
  
  const { rows } = await query(sql, [userId]);
  return rows[0] || null;
};

// Procesar deposito con Stripe con ACID
export const processDeposit = async (userId, amount, stripeEventId, paymentIntentId, currency) => {
  const client = await pool.connect(); // Obtenemos un cliente dedicado para la transaccion

  try {
    await client.query('BEGIN'); // Inicia la transaccion

    // 1. Idempotencia: Verifica que el evento de Stripe no se haya procesado antes
    const checkEvent = await client.query(
      'SELECT id_pago FROM pago WHERE stripe_event_id = $1',
      [stripeEventId]
    );
    if (checkEvent.rows.length > 0) {
      await client.query('ROLLBACK');
      return { status: 'ignored', message: 'Wenhook ya procesado anteriormente' };
    }

    // 2. Bloquear la fila de la billetera y sumar el saldo (FOR UPDATE interno en el UPDATE)
    const updateWallet = await client.query(`
      UPDATE billetera
      SET saldo_real = saldo_real + $1
      WHERE id_usuario = $2
      RETURNING id_billetera, saldo_real, saldo_bono
      `, [amount, userId]);
    
      if (updateWallet.rows.length === 0) {
        throw new Error('Billetera no encontrada para el usuario');
      }
      const { id_billetera, saldo_real, saldo_bono } = updateWallet.rows[0];

      // 3. Registrar en la tabla transaccion (Auditoría financiera)
      // Asumimos que el tipo_transaccion 'deposito' tiene el ID 1 (lo insertaremos en la DB luego)
      const insertTx = await client.query(`
        INSERT INTO transaccion (id_billetera, id_tipo_transaccion, monto, saldo_real_posterior, saldo_bono_posterior, estado) 
        VALUES ($1, 1, $2, $3, $4, 'completado') 
        RETURNING id_transaccion
      `, [id_billetera, amount, saldo_real, saldo_bono]);
      const id_transaccion = insertTx.rows[0].id_transaccion;

      // 4. Registrar en la tabla pago
      await client.query(`
      INSERT INTO pago (id_transaccion, tipo, monto, moneda, stripe_payment_intent_id, stripe_event_id, estado, fecha_confirmacion) 
      VALUES ($1, 'deposito', $2, $3, $4, $5, 'completado', CURRENT_TIMESTAMP)
      `, [id_transaccion, amount, currency, paymentIntentId, stripeEventId]);

      await client.query('COMMIT'); // Confirmamos los cambios
      return { status: 'success', saldo_real };

  } catch (error) {
    await client.query('ROLLBACK'); // Revertimos todo si algo falla
    throw error;
  } finally {
    client.release(); // Devolvemos el cliente al pool
  }
};

// Crear PaymentIntent
export const createPaymentIntent = async (userId, amount, currency = 'usd') => {
  // Stripe maneja los montos en centavos
  const amountInCents = Math.round(amount * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency,
    metadata: {
      id_usuario: userId // Dato vital que leerá nuestro webhook
    }
  });

  return paymentIntent.client_secret;
};

// Procesar solicitud de retiro con ACID
export const processWithdrawal = async (userId, amount, currency = 'usd', destinationAccount) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Bloquear la billetera y obtener el saldo actual
    const checkWallet = await client.query(
      'SELECT id_billetera, saldo_real, saldo_bono FROM billetera WHERE id_usuario = $1 FOR UPDATE',
      [userId]
    );

    if (checkWallet.rows.length === 0) {
      throw new Error('Billetera no encontrada');
    }

    const { id_billetera, saldo_real: currentBalance, saldo_bono } = checkWallet.rows[0];

    // 2. Validar fondos suficientes
    if (parseFloat(currentBalance) < amount) {
      const error = new Error('Fondos insuficientes');
      error.code = 'INSUFFICIENT_FUNDS';
      throw error;
    }

    // 3. Descontar el saldo
    const updateWallet = await client.query(`
      UPDATE billetera
      SET saldo_real = saldo_real - $1
      WHERE id_usuario = $2
      RETURNING saldo_real
    `, [amount, userId]);
    
    const newBalance = updateWallet.rows[0].saldo_real;

    // 4. Registrar en transaccion (ID 2 = retiro)
    const insertTx = await client.query(`
      INSERT INTO transaccion (id_billetera, id_tipo_transaccion, monto, saldo_real_posterior, saldo_bono_posterior, estado) 
      VALUES ($1, 2, $2, $3, $4, 'pendiente') 
      RETURNING id_transaccion
    `, [id_billetera, amount, newBalance, saldo_bono]);
    
    const id_transaccion = insertTx.rows[0].id_transaccion;

    // 5. Registrar en pago (estado pendiente para revisión manual/KYC)
    // Usamos stripe_payment_intent_id para guardar la cuenta destino por ahora
    await client.query(`
      INSERT INTO pago (id_transaccion, tipo, monto, moneda, stripe_payment_intent_id, estado) 
      VALUES ($1, 'retiro', $2, $3, $4, 'pendiente')
    `, [id_transaccion, amount, currency, destinationAccount]);

    await client.query('COMMIT');
    return { status: 'pending_approval', newBalance };

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Obtener historial de transacciones con paginación
export const getTransactionHistory = async (userId, limit = 20, offset = 0) => {
  // 1. Obtener el ID de la billetera del usuario
  const walletQuery = await query(
    'SELECT id_billetera FROM billetera WHERE id_usuario = $1', 
    [userId]
  );
  
  if (walletQuery.rows.length === 0) {
    return { transactions: [], total: 0 };
  }
  
  const walletId = walletQuery.rows[0].id_billetera;

  // 2. Consultar las transacciones uniendo con su tipo
  const sql = `
    SELECT 
      t.id_transaccion, 
      t.monto, 
      t.saldo_real_posterior, 
      t.estado,
      t.fecha,
      tt.nombre AS tipo,
      tt.naturaleza
    FROM transaccion t
    JOIN tipo_transaccion tt ON t.id_tipo_transaccion = tt.id_tipo_transaccion
    WHERE t.id_billetera = $1
    ORDER BY t.fecha DESC -- Ordenamos desde el más reciente
    LIMIT $2 OFFSET $3
  `;

  const { rows } = await query(sql, [walletId, limit, offset]);

  // 3. Obtener el total para la paginación del frontend
  const countSql = 'SELECT COUNT(*) as total FROM transaccion WHERE id_billetera = $1';
  const countResult = await query(countSql, [walletId]);

  return {
    transactions: rows,
    total: parseInt(countResult.rows[0].total, 10),
    limit,
    offset
  };
};

// Procesa una apuesta (descuenta saldo)
// Uso interno para el equipo de Juegos
export const processBet = async (id_usuario, monto) => {
  // 1. Validaciones de seguridad de entrada
  if (!id_usuario) throw new Error('MISSING_USER_ID');
  if (typeof monto !== 'number' || isNaN(monto) || monto <= 0) {
    throw new Error('INVALID_BET_AMOUNT');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 2. Bloquear la fila para evitar doble apuesta simultánea
    const walletRes = await client.query(
      'SELECT saldo_real FROM billetera WHERE id_usuario = $1 FOR UPDATE',
      [id_usuario]
    );

    if (walletRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

    const saldoActual = parseFloat(walletRes.rows[0].saldo_real);
    if (saldoActual < monto) throw new Error('INSUFFICIENT_FUNDS');

    const nuevoSaldo = saldoActual - monto;

    // 3. Descontar de la billetera
    await client.query(
      'UPDATE billetera SET saldo_real = $1 WHERE id_usuario = $2',
      [nuevoSaldo, id_usuario]
    );

    // 4. Registrar en el historial
    await client.query(
      `INSERT INTO transacciones 
      (id_usuario, monto, tipo, naturaleza, estado, saldo_real_posterior) 
      VALUES ($1, $2, 'apuesta', 'debito', 'completado', $3)`,
      [id_usuario, monto, nuevoSaldo]
    );

    await client.query('COMMIT');
    return { success: true, newBalance: nuevoSaldo };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Procesa un premio (suma saldo)
// Uso interno para el equipo de Juegos
export const processWin = async (id_usuario, monto) => {
  // 1. Validaciones de seguridad de entrada
  if (!id_usuario) throw new Error('MISSING_USER_ID');
  if (typeof monto !== 'number' || isNaN(monto) || monto <= 0) {
    throw new Error('INVALID_WIN_AMOUNT');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const walletRes = await client.query(
      'SELECT saldo_real FROM billetera WHERE id_usuario = $1 FOR UPDATE',
      [id_usuario]
    );

    if (walletRes.rows.length === 0) throw new Error('WALLET_NOT_FOUND');

    const saldoActual = parseFloat(walletRes.rows[0].saldo_real);
    const nuevoSaldo = saldoActual + monto;

    await client.query(
      'UPDATE billetera SET saldo_real = $1 WHERE id_usuario = $2',
      [nuevoSaldo, id_usuario]
    );

    await client.query(
      `INSERT INTO transacciones 
      (id_usuario, monto, tipo, naturaleza, estado, saldo_real_posterior) 
      VALUES ($1, $2, 'premio', 'credito', 'completado', $3)`,
      [id_usuario, monto, nuevoSaldo]
    );

    await client.query('COMMIT');
    return { success: true, newBalance: nuevoSaldo };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};