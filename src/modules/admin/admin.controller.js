import * as adminService from './admin.services.js';

export const getUsers = async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    
    const result = await adminService.listUsers({ 
      search, 
      page: page ? parseInt(page) : 1, 
      limit: limit ? parseInt(limit) : 10 
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "ADMIN_FETCH_ERROR",
        message: error.message || "Error al obtener la lista de usuarios."
      }
    });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body; // 'activo' o 'baneado'/'eliminado'

    const updatedUser = await adminService.updateUserStatus(id, estado);

    res.status(200).json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: "USER_UPDATE_ERROR",
        message: error.message
      }
    });
  }
};

export const getWithdrawals = async (req, res) => {
  try {
    const { page, limit } = req.query;
    
    const result = await adminService.listPendingWithdrawals({ 
      page: page ? parseInt(page) : 1, 
      limit: limit ? parseInt(limit) : 10 
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: "WITHDRAWALS_FETCH_ERROR",
        message: error.message || "Error al obtener los retiros."
      }
    });
  }
};

export const resolveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params; // ID de la transacción
    const { accion } = req.body; // 'aprobar' o 'rechazar'

    const processedTx = await adminService.processWithdrawal(id, accion);

    res.status(200).json({
      success: true,
      data: processedTx,
      message: `Retiro ${accion} con éxito.`
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: {
        code: "WITHDRAWAL_PROCESS_ERROR",
        message: error.message
      }
    });
  }
};

export const getGlobalTransactions = async (req, res) => {
  try {
    const { page, limit, search, tipo, estado } = req.query;

    const result = await adminService.listGlobalTransactions({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 15,
      search: search || '',
      tipo: tipo || '',
      estado: estado || ''
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TRANSACTIONS_FETCH_ERROR',
        message: error.message || 'Error al obtener el historial global.'
      }
    });
  }
};