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