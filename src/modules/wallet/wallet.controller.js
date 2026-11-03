import Stripe from 'stripe';
import { config } from '../../config/env.js';
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

const stripe = new Stripe(config.stripe.secretKey);

export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // IMPORTANTE: Stripe requiere el body en formato crudo (raw) para validar la firma.
    // Esto lo configuraremos en las rutas.
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error(`[Stripe Webhook Error]: Validación de firma fallida`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar el evento de pago exitoso
  if (event.type === 'payment_intent.succeeded') {
    const paymentIntent = event.data.object;
    
    // Stripe maneja los montos en centavos, así que dividimos por 100
    const amount = paymentIntent.amount / 100;
    const currency = paymentIntent.currency.toUpperCase();
    const stripeEventId = event.id;
    
    // Extraemos el id_usuario de los metadatos que enviaremos al crear el pago
    const userId = paymentIntent.metadata.id_usuario;

    if (!userId) {
      console.error('[Stripe Webhook Error]: Pago recibido sin id_usuario en los metadatos');
      return res.status(400).send('Falta id_usuario en metadatos');
    }

    try {
      const result = await walletService.processDeposit(
        userId, 
        amount, 
        stripeEventId, 
        paymentIntent.id, 
        currency
      );
      console.log(`[Stripe Webhook]: Depósito procesado. Estado: ${result.status}`);
    } catch (error) {
      console.error('[Stripe Webhook Error]: Fallo al procesar transacción en BD', error);
      return res.status(500).send('Error interno al procesar el depósito');
    }
  }

  // Stripe requiere un status 200 rápido para saber que recibimos el webhook
  res.status(200).json({ received: true });
};

export const createDepositIntent = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const { amount, currency } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'El monto del depósito debe ser mayor a cero.'
        }
      });
    }

    const clientSecret = await walletService.createPaymentIntent(userId, amount, currency || 'usd');

    res.status(200).json({ clientSecret });
  } catch (error) {
    console.error('[Wallet Controller Error]:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PAYMENT_INTENT_FAILED',
        message: 'No se pudo inicializar la pasarela de pago.'
      }
    });
  }
};

// Recibira la peticion HTTP, validara el monto y llamara al servicio
export const requestWithdrawal = async (req, res) => {
  try {
    const userId = req.user.id_usuario;
    const { amount, currency, destinationAccount } = req.body;

    // Validación básica
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: 'El monto del retiro debe ser mayor a cero.'
        }
      });
    }

    if (!destinationAccount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_DESTINATION',
          message: 'Debe proporcionar una cuenta o método de destino para el retiro.'
        }
      });
    }

    const result = await walletService.processWithdrawal(userId, amount, currency || 'usd', destinationAccount);

    res.status(200).json({
      success: true,
      message: 'Solicitud de retiro registrada correctamente. Pendiente de aprobación.',
      data: {
        newBalance: result.newBalance,
        status: result.status
      }
    });

  } catch (error) {
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INSUFFICIENT_FUNDS',
          message: 'No tienes saldo real suficiente para realizar este retiro.'
        }
      });
    }

    console.error('[Wallet Controller Error - Withdrawal]:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'WITHDRAWAL_FAILED',
        message: 'Ocurrió un error al procesar la solicitud de retiro.'
      }
    });
  }
};