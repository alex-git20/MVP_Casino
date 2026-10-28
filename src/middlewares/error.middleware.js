export const errorHandler = (err, req, res, next) => {
  console.error('[Error No Controlado]:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_SERVER_ERROR',
      message: err.message || 'Ocurrió un error inesperado en el servidor.'
    }
  });
};