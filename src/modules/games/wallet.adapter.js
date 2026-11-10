// wallet.adapter.js
// Adaptador TEMPORAL entre el módulo de Juegos y la billetera.
//
// ¿Por qué existe?
//   - Juegos necesita descontar/acreditar saldo DENTRO de su propia transacción
//     (mismo `client` de pg), para que "descontar saldo + registrar apuesta" sea atómico.
//   - Las funciones actuales processBet/processWin de wallet.services.js abren su propia
//     transacción y no devuelven id_transaccion, así que no sirven para esto todavía.
//
// Firmas acordadas (Fase 4 del plan):
//   debitarApuesta(client, { idUsuario, monto })  -> id_transaccion
//   acreditarPremio(client, { idUsuario, monto }) -> id_transaccion
//
// Cuando el módulo wallet exponga estas mismas firmas, basta con cambiar el import
// en games.services.js y borrar este archivo.

function crearError(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// Busca el id de tipo_transaccion por nombre ('apuesta' o 'premio')
async function idTipoTransaccion(client, nombre) {
  const { rows } = await client.query(
    'SELECT id_tipo_transaccion FROM tipo_transaccion WHERE nombre = $1 LIMIT 1',
    [nombre]
  );
  if (rows.length === 0) {
    throw crearError(
      'TIPO_TRANSACCION_NO_CONFIGURADO',
      `No existe el tipo_transaccion '${nombre}' en la base de datos.`,
      500
    );
  }
  return rows[0].id_tipo_transaccion;
}

async function registrarTransaccion(client, { idBilletera, idTipo, monto, saldoReal, saldoBono }) {
  const { rows } = await client.query(
    `INSERT INTO transaccion
       (id_billetera, id_tipo_transaccion, monto, saldo_real_posterior, saldo_bono_posterior, estado)
     VALUES ($1, $2, $3, $4, $5, 'completado')
     RETURNING id_transaccion`,
    [idBilletera, idTipo, monto, saldoReal, saldoBono]
  );
  return rows[0].id_transaccion;
}

// Descuenta `monto` del saldo real. Debe llamarse dentro de un BEGIN ya abierto.
export async function debitarApuesta(client, { idUsuario, monto }) {
  const idTipo = await idTipoTransaccion(client, 'apuesta');
  const montoTxt = Number(monto).toFixed(2);

  // El UPDATE bloquea la fila y valida el saldo en un solo paso (sin carreras).
  const { rows } = await client.query(
    `UPDATE billetera
        SET saldo_real = saldo_real - $1
      WHERE id_usuario = $2 AND saldo_real >= $1
      RETURNING id_billetera, saldo_real, saldo_bono`,
    [montoTxt, idUsuario]
  );

  if (rows.length === 0) {
    const existe = await client.query('SELECT 1 FROM billetera WHERE id_usuario = $1', [idUsuario]);
    if (existe.rows.length === 0) {
      throw crearError('WALLET_NOT_FOUND', 'No se encontró la billetera del usuario.', 404);
    }
    throw crearError('INSUFFICIENT_FUNDS', 'No tienes saldo real suficiente para esta apuesta.', 400);
  }

  const { id_billetera, saldo_real, saldo_bono } = rows[0];
  return registrarTransaccion(client, {
    idBilletera: id_billetera, idTipo, monto: montoTxt, saldoReal: saldo_real, saldoBono: saldo_bono,
  });
}

// Suma `monto` al saldo real. Debe llamarse dentro de un BEGIN ya abierto.
export async function acreditarPremio(client, { idUsuario, monto }) {
  const idTipo = await idTipoTransaccion(client, 'premio');
  const montoTxt = Number(monto).toFixed(2);

  const { rows } = await client.query(
    `UPDATE billetera
        SET saldo_real = saldo_real + $1
      WHERE id_usuario = $2
      RETURNING id_billetera, saldo_real, saldo_bono`,
    [montoTxt, idUsuario]
  );
  if (rows.length === 0) {
    throw crearError('WALLET_NOT_FOUND', 'No se encontró la billetera del usuario.', 404);
  }

  const { id_billetera, saldo_real, saldo_bono } = rows[0];
  return registrarTransaccion(client, {
    idBilletera: id_billetera, idTipo, monto: montoTxt, saldoReal: saldo_real, saldoBono: saldo_bono,
  });
}
