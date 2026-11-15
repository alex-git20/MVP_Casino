import { pool } from '../../config/db.js';

export const listUsers = async ({ search = '', page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;
  const searchTerm = `%${search}%`;

  // Traemos usuarios que sean jugadores (excluyendo a otros admins) con sus saldos
  const query = `
    SELECT u.id_usuario, u.username, u.email, u.estado, u.fecha_registro,
           COALESCE(b.saldo_real, 0) as saldo_real, 
           COALESCE(b.saldo_bono, 0) as saldo_bono
    FROM usuario u
    JOIN rol r ON u.id_rol = r.id_rol
    LEFT JOIN billetera b ON u.id_usuario = b.id_usuario
    WHERE r.nombre = 'jugador' 
      AND (u.username ILIKE $1 OR u.email ILIKE $1)
    ORDER BY u.fecha_registro DESC
    LIMIT $2 OFFSET $3;
  `;
  
  const countQuery = `
    SELECT COUNT(*) 
    FROM usuario u
    JOIN rol r ON u.id_rol = r.id_rol
    WHERE r.nombre = 'jugador' 
      AND (u.username ILIKE $1 OR u.email ILIKE $1);
  `;

  const [usersResult, countResult] = await Promise.all([
    pool.query(query, [searchTerm, limit, offset]),
    pool.query(countQuery, [searchTerm])
  ]);

  const totalUsers = parseInt(countResult.rows[0].count);

  return {
    users: usersResult.rows,
    pagination: {
      total: totalUsers,
      page: parseInt(page),
      totalPages: Math.ceil(totalUsers / limit)
    }
  };
};

export const updateUserStatus = async (id_usuario, newStatus) => {
  // Validamos que el estado sea uno de los permitidos
  const validStatuses = ['activo', 'eliminado', 'baneado'];
  if (!validStatuses.includes(newStatus)) {
    throw new Error('Estado no válido.');
  }

  const query = `
    UPDATE usuario 
    SET estado = $1 
    WHERE id_usuario = $2 
    RETURNING id_usuario, username, email, estado;
  `;
  const result = await pool.query(query, [newStatus, id_usuario]);

  if (result.rows.length === 0) {
    throw new Error('Usuario no encontrado.');
  }

  return result.rows[0];
};

// Obtener todos los retiros pendientes
export const listPendingWithdrawals = async ({ page = 1, limit = 10 }) => {
  const offset = (page - 1) * limit;

  // Hacemos JOIN pasando por billetera para llegar al usuario
  // y por tipo_transaccion para filtrar solo los retiros.
  const query = `
    SELECT t.id_transaccion, t.monto, t.fecha, t.estado,
           u.id_usuario, u.username, u.email
    FROM transaccion t
    JOIN billetera b ON t.id_billetera = b.id_billetera
    JOIN usuario u ON b.id_usuario = u.id_usuario
    JOIN tipo_transaccion tt ON t.id_tipo_transaccion = tt.id_tipo_transaccion
    WHERE tt.nombre = 'retiro' AND t.estado = 'pendiente'
    ORDER BY t.fecha ASC
    LIMIT $1 OFFSET $2;
  `;
  
  const countQuery = `
    SELECT COUNT(*) 
    FROM transaccion t
    JOIN tipo_transaccion tt ON t.id_tipo_transaccion = tt.id_tipo_transaccion
    WHERE tt.nombre = 'retiro' AND t.estado = 'pendiente';
  `;

  const [withdrawalsResult, countResult] = await Promise.all([
    pool.query(query, [limit, offset]),
    pool.query(countQuery)
  ]);

  const total = parseInt(countResult.rows[0].count);

  return {
    withdrawals: withdrawalsResult.rows,
    pagination: {
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit)
    }
  };
};

// Aprobar o Rechazar un retiro
export const processWithdrawal = async (id_transaccion, accion) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Bloqueamos la transacción y traemos el id de la billetera
    const txQuery = `
      SELECT t.id_billetera, t.monto, t.estado 
      FROM transaccion t
      WHERE t.id_transaccion = $1 FOR UPDATE;
    `;
    const txResult = await client.query(txQuery, [id_transaccion]);

    if (txResult.rows.length === 0) throw new Error('Transacción no encontrada.');
    
    const transaccion = txResult.rows[0];

    if (transaccion.estado !== 'pendiente') {
      throw new Error(`Este retiro ya fue procesado (${transaccion.estado}).`);
    }

    // 2. Ejecutar la acción
    let nuevoEstado = '';
    
    if (accion === 'aprobar') {
      nuevoEstado = 'completado';
      // El dinero ya se descontó de la billetera cuando el jugador solicitó el retiro.
      
    } else if (accion === 'rechazar') {
      nuevoEstado = 'rechazado';
      // Como se rechaza, le devolvemos el dinero a su saldo real
      const refundQuery = `
        UPDATE billetera 
        SET saldo_real = saldo_real + $1 
        WHERE id_billetera = $2;
      `;
      await client.query(refundQuery, [transaccion.monto, transaccion.id_billetera]);
      
      // Nota: Para una auditoría perfecta, podrías insertar aquí una NUEVA transacción 
      // de tipo 'reembolso', pero por ahora actualizar el saldo es suficiente.
    } else {
      throw new Error("Acción no válida. Usa 'aprobar' o 'rechazar'.");
    }

    // 3. Actualizamos el estado de la transacción original
    const updateTxQuery = `
      UPDATE transaccion 
      SET estado = $1 
      WHERE id_transaccion = $2 
      RETURNING id_transaccion, monto, estado;
    `;
    const updateResult = await client.query(updateTxQuery, [nuevoEstado, id_transaccion]);

    await client.query('COMMIT');
    return updateResult.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};