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