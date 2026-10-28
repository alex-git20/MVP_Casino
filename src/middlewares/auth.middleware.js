export const requireAuth = (req, res, next) => {
  // Simulamos temporalmente que el Rol 2 ya validó el token JWT 
  // y nos inyectó los datos del usuario en la request.
  // Asumiremos que el usuario con ID 1 está haciendo las peticiones.
  req.user = {
    id_usuario: 1
  };
  
  next();
};