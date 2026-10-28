import * as walletService from './wallet.services.js';

export const getBalance = async (req, res) => {
  try {
    const userId = req.user.id_usuario; // Extraído del JWT
    
    const balance = await walletService.getUserBalance(userId);
    
    if (!balance) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'WALLET_NOT_FOUND',
          message: 'No se encontró una billetera asociada a este usuario.'
        }
      });
    }

    res.status(200).json(balance);
  } catch (error) {
    console.error('[Wallet Controller Error]:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error al consultar el saldo de la billetera.'
      }
    });
  }
};