import jwt from 'jsonwebtoken';

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: "MISSING_OR_INVALID_TOKEN",
          message: "Se requiere un token de autenticación válido."
        }
      });
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'casino_secret_key_temporal';
    const decoded = jwt.verify(token, jwtSecret);

    req.user = decoded; 
    
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "El token ha expirado o es inválido."
      }
    });
  }
};