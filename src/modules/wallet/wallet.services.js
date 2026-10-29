import { query } from '../../config/db.js';

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