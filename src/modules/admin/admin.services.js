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