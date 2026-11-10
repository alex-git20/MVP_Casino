// games.services.js
// Reglas de negocio y acceso a datos del módulo de Juegos (ruleta americana).
// Solo depende de db.js, roulette.logic.js y el adaptador de billetera.

import { query, pool } from '../../config/db.js';
import {
  numerosCubiertos,
  generarNumeroGanador,
  construirResultado,
  calcularPremio,
} from './roulette.logic.js';
import { debitarApuesta, acreditarPremio } from './wallet.adapter.js';

// Error con código y status HTTP, que el controller traduce a { success:false, error:{code,message} }
export function crearError(code, message, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

// Ejecuta `fn(client)` dentro de BEGIN/COMMIT; ante cualquier error hace ROLLBACK.
async function enTransaccion(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Catálogo ----------

export async function listarJuegos() {
  const { rows } = await query(
    `SELECT id_juego, codigo, nombre, apuesta_min, apuesta_max
       FROM juego
      WHERE activo = TRUE
      ORDER BY id_juego`
  );
  return rows;
}

export async function obtenerJuego(idJuego) {
  const { rows } = await query(
    'SELECT id_juego, codigo, nombre, apuesta_min, apuesta_max, activo FROM juego WHERE id_juego = $1',
    [idJuego]
  );
  if (rows.length === 0) throw crearError('JUEGO_NO_ENCONTRADO', 'El juego no existe.', 404);
  return rows[0];
}

export async function listarTiposApuesta(idJuego) {
  await obtenerJuego(idJuego);
  const { rows } = await query(
    `SELECT id_tipo_apuesta, nombre, multiplicador_pago
       FROM tipo_apuesta
      WHERE id_juego = $1
      ORDER BY id_tipo_apuesta`,
    [idJuego]
  );
  return rows;
}

// Devuelve la ronda abierta más reciente del juego, o null si no hay.
export async function obtenerRondaAbierta(idJuego) {
  await obtenerJuego(idJuego);
  const { rows } = await query(
    `SELECT id_ronda, id_juego, estado, fecha_inicio
       FROM ronda
      WHERE id_juego = $1 AND estado = 'abierta'
      ORDER BY id_ronda DESC
      LIMIT 1`,
    [idJuego]
  );
  return rows[0] || null;
}

// ---------- Rondas ----------

// Abre una ronda nueva. Solo puede haber una ronda abierta por juego.
export async function abrirRonda(idJuego) {
  return enTransaccion(async (client) => {
    // Bloquear el juego evita que dos peticiones simultáneas abran dos rondas.
    const juego = await client.query(
      'SELECT id_juego, activo FROM juego WHERE id_juego = $1 FOR UPDATE',
      [idJuego]
    );
    if (juego.rows.length === 0) throw crearError('JUEGO_NO_ENCONTRADO', 'El juego no existe.', 404);
    if (!juego.rows[0].activo) throw crearError('JUEGO_INACTIVO', 'El juego no está activo.', 409);

    const abierta = await client.query(
      "SELECT id_ronda FROM ronda WHERE id_juego = $1 AND estado = 'abierta' LIMIT 1",
      [idJuego]
    );
    if (abierta.rows.length > 0) {
      throw crearError('RONDA_YA_ABIERTA', `Ya existe una ronda abierta (id ${abierta.rows[0].id_ronda}).`, 409);
    }

    const { rows } = await client.query(
      `INSERT INTO ronda (id_juego, estado)
       VALUES ($1, 'abierta')
       RETURNING id_ronda, id_juego, estado, fecha_inicio`,
      [idJuego]
    );
    return rows[0];
  });
}

// Cierra la ronda: genera el número ganador y la pasa a 'cerrada'. Ya no acepta apuestas.
export async function cerrarRonda(idRonda) {
  return enTransaccion(async (client) => {
    // FOR UPDATE espera a que terminen las apuestas en curso (que toman FOR SHARE).
    const { rows } = await client.query(
      'SELECT id_ronda, estado FROM ronda WHERE id_ronda = $1 FOR UPDATE',
      [idRonda]
    );
    if (rows.length === 0) throw crearError('RONDA_NO_ENCONTRADA', 'La ronda no existe.', 404);
    if (rows[0].estado !== 'abierta') {
      throw crearError('RONDA_NO_ABIERTA', `La ronda está en estado '${rows[0].estado}'.`, 409);
    }

    const resultado = construirResultado(generarNumeroGanador());
    const upd = await client.query(
      `UPDATE ronda
          SET estado = 'cerrada', resultado = $2, fecha_fin = CURRENT_TIMESTAMP
        WHERE id_ronda = $1
        RETURNING id_ronda, id_juego, estado, resultado, fecha_inicio, fecha_fin`,
      [idRonda, JSON.stringify(resultado)]
    );
    return upd.rows[0];
  });
}

// Liquida una ronda cerrada: marca cada apuesta como ganada/perdida, acredita premios
// y pasa la ronda a 'pagada'. Todo o nada: si algo falla, la ronda queda 'cerrada'
// y se puede volver a liquidar.
export async function liquidarRonda(idRonda) {
  return enTransaccion(async (client) => {
    const ronda = await client.query(
      'SELECT id_ronda, estado, resultado FROM ronda WHERE id_ronda = $1 FOR UPDATE',
      [idRonda]
    );
    if (ronda.rows.length === 0) throw crearError('RONDA_NO_ENCONTRADA', 'La ronda no existe.', 404);
    const { estado, resultado } = ronda.rows[0];
    if (estado !== 'cerrada') {
      throw crearError('RONDA_NO_CERRADA', `Solo se liquidan rondas cerradas (estado actual: '${estado}').`, 409);
    }
    const numeroGanador = resultado.numero_ganador;

    // Orden por usuario para bloquear billeteras siempre en el mismo orden.
    const apuestas = await client.query(
      `SELECT a.id_apuesta, a.id_usuario, a.monto, a.seleccion, t.nombre AS tipo, t.multiplicador_pago
         FROM apuesta a
         JOIN tipo_apuesta t ON t.id_tipo_apuesta = a.id_tipo_apuesta
        WHERE a.id_ronda = $1 AND a.estado = 'pendiente'
        ORDER BY a.id_usuario, a.id_apuesta`,
      [idRonda]
    );

    let ganadas = 0;
    let totalPagado = 0;

    for (const a of apuestas.rows) {
      const gano = numerosCubiertos(a.tipo, a.seleccion).includes(numeroGanador);

      if (gano) {
        const premio = calcularPremio(a.monto, a.multiplicador_pago);
        const idTx = await acreditarPremio(client, { idUsuario: a.id_usuario, monto: premio });
        await client.query(
          `UPDATE apuesta
              SET estado = 'ganada', monto_premio = $2, id_transaccion_premio = $3
            WHERE id_apuesta = $1`,
          [a.id_apuesta, premio.toFixed(2), idTx]
        );
        ganadas += 1;
        totalPagado = Math.round((totalPagado + premio) * 100) / 100;
      } else {
        await client.query(
          "UPDATE apuesta SET estado = 'perdida', monto_premio = 0 WHERE id_apuesta = $1",
          [a.id_apuesta]
        );
      }
    }

    await client.query("UPDATE ronda SET estado = 'pagada' WHERE id_ronda = $1", [idRonda]);

    return {
      id_ronda: Number(idRonda),
      resultado,
      apuestas_liquidadas: apuestas.rows.length,
      ganadas,
      perdidas: apuestas.rows.length - ganadas,
      total_pagado: totalPagado,
    };
  });
}

// ---------- Apuestas ----------

function validarMonto(monto) {
  if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) {
    throw crearError('MONTO_INVALIDO', 'El monto debe ser un número mayor a cero.');
  }
  if (Math.abs(monto * 100 - Math.round(monto * 100)) > 1e-9) {
    throw crearError('MONTO_INVALIDO', 'El monto admite como máximo 2 decimales.');
  }
}

// Guarda solo los campos que importan para cada tipo de apuesta.
function normalizarSeleccion(tipo, seleccion) {
  if (['pleno', 'split', 'calle', 'esquina'].includes(tipo)) {
    return { numeros: [...seleccion.numeros].sort((x, y) => x - y) };
  }
  if (tipo === 'docena' || tipo === 'columna') return { valor: seleccion.valor };
  return {};
}

// Registra una apuesta en una sola transacción:
// BEGIN -> bloquear y validar ronda -> validar tipo/monto/selección -> descontar saldo -> insertar apuesta -> COMMIT
export async function realizarApuesta({ idUsuario, idRonda, idTipoApuesta, monto, seleccion }) {
  validarMonto(monto);

  return enTransaccion(async (client) => {
    // FOR SHARE: varias apuestas pueden entrar a la vez, pero la ronda no se puede cerrar
    // mientras una apuesta está en curso.
    const ronda = await client.query(
      `SELECT r.id_ronda, r.estado, j.id_juego, j.activo, j.apuesta_min, j.apuesta_max
         FROM ronda r
         JOIN juego j ON j.id_juego = r.id_juego
        WHERE r.id_ronda = $1
        FOR SHARE OF r`,
      [idRonda]
    );
    if (ronda.rows.length === 0) throw crearError('RONDA_NO_ENCONTRADA', 'La ronda no existe.', 404);
    const r = ronda.rows[0];
    if (!r.activo) throw crearError('JUEGO_INACTIVO', 'El juego no está activo.', 409);
    if (r.estado !== 'abierta') throw crearError('RONDA_CERRADA', 'La ronda ya no acepta apuestas.', 409);

    const min = Number(r.apuesta_min);
    const max = Number(r.apuesta_max);
    if (monto < min || monto > max) {
      throw crearError('MONTO_FUERA_DE_LIMITES', `El monto debe estar entre ${min} y ${max}.`);
    }

    const tipo = await client.query(
      'SELECT id_tipo_apuesta, nombre, multiplicador_pago FROM tipo_apuesta WHERE id_tipo_apuesta = $1 AND id_juego = $2',
      [idTipoApuesta, r.id_juego]
    );
    if (tipo.rows.length === 0) {
      throw crearError('TIPO_APUESTA_NO_ENCONTRADO', 'El tipo de apuesta no existe para este juego.', 404);
    }
    const nombreTipo = tipo.rows[0].nombre;

    try {
      numerosCubiertos(nombreTipo, seleccion); // valida forma y cantidad
    } catch (e) {
      throw crearError(e.code || 'SELECCION_INVALIDA', e.message);
    }

    const idTx = await debitarApuesta(client, { idUsuario, monto });

    const { rows } = await client.query(
      `INSERT INTO apuesta (id_ronda, id_usuario, id_tipo_apuesta, id_transaccion_apuesta, monto, seleccion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_apuesta, id_ronda, id_tipo_apuesta, monto, seleccion, estado, fecha`,
      [idRonda, idUsuario, idTipoApuesta, idTx, monto.toFixed(2), JSON.stringify(normalizarSeleccion(nombreTipo, seleccion))]
    );

    return { ...rows[0], tipo: nombreTipo, multiplicador_pago: tipo.rows[0].multiplicador_pago };
  });
}

// Historial de apuestas del usuario (paginado), más recientes primero.
export async function listarMisApuestas(idUsuario, limit = 20, offset = 0) {
  const { rows } = await query(
    `SELECT a.id_apuesta, a.id_ronda, t.nombre AS tipo, a.monto, a.seleccion,
            a.estado, a.monto_premio, a.fecha, r.resultado
       FROM apuesta a
       JOIN tipo_apuesta t ON t.id_tipo_apuesta = a.id_tipo_apuesta
       JOIN ronda r ON r.id_ronda = a.id_ronda
      WHERE a.id_usuario = $1
      ORDER BY a.fecha DESC, a.id_apuesta DESC
      LIMIT $2 OFFSET $3`,
    [idUsuario, limit, offset]
  );
  const total = await query('SELECT COUNT(*) AS total FROM apuesta WHERE id_usuario = $1', [idUsuario]);
  return { apuestas: rows, total: parseInt(total.rows[0].total, 10), limit, offset };
}
