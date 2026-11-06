import * as authService from './auth.services.js';

export const register = async (req, res) => {
  try {
    const { username, email, password, fecha_nacimiento } = req.body;
    
    // El servicio se encargará de la lógica pesada y la BD
    const newUser = await authService.registerUser({ username, email, password, fecha_nacimiento });

    res.status(201).json({
      success: true,
      data: newUser // Retorna confirmación de creación de usuario y billetera en cero
    });
  } catch (error) {
    // Formato JSON estándar de errores exigido
    res.status(400).json({
      success: false,
      error: {
        code: "REGISTRATION_ERROR",
        message: error.message
      }
    });
  }
};