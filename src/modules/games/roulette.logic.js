// roulette.logic.js
// Lógica pura de la ruleta americana (sin base de datos ni dependencias de otros módulos).
// Convención: el 00 se representa como 37. Números válidos: 0 a 37.

import { randomInt } from 'node:crypto';

export const NUMERO_MIN = 0;
export const NUMERO_MAX = 37;
export const DOBLE_CERO = 37;

const ROJOS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

// Splits válidos que involucran 0 y 00 (el resto se calcula por la cuadrícula del 1 al 36)
const SPLITS_ESPECIALES = new Set(['0-37', '0-1', '0-2', '2-37', '3-37']);

export const TIPOS_APUESTA = [
  'pleno', 'split', 'calle', 'esquina', 'docena', 'columna',
  'rojo', 'negro', 'par', 'impar', 'bajo', 'alto',
];

function crearError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ---------- Resultado de la ronda ----------

export function colorDe(numero) {
  if (numero === 0 || numero === DOBLE_CERO) return 'verde';
  return ROJOS.has(numero) ? 'rojo' : 'negro';
}

// Genera el número ganador con un generador criptográficamente seguro
export function generarNumeroGanador() {
  return randomInt(NUMERO_MIN, NUMERO_MAX + 1); // el máximo es exclusivo
}

// Formato listo para guardar en ronda.resultado (JSONB)
export function construirResultado(numero) {
  return { numero_ganador: numero, color: colorDe(numero) };
}

// ---------- Cobertura de cada tipo de apuesta ----------

function leerNumeros(seleccion) {
  const nums = seleccion?.numeros;
  if (!Array.isArray(nums) || nums.length === 0) {
    throw crearError('SELECCION_INVALIDA', 'La selección debe incluir una lista de números.');
  }
  for (const n of nums) {
    if (!Number.isInteger(n) || n < NUMERO_MIN || n > NUMERO_MAX) {
      throw crearError('SELECCION_INVALIDA', 'Los números deben ser enteros entre 0 y 37 (37 es el 00).');
    }
  }
  if (new Set(nums).size !== nums.length) {
    throw crearError('SELECCION_INVALIDA', 'La selección tiene números repetidos.');
  }
  return [...nums].sort((a, b) => a - b);
}

function leerValor(seleccion) {
  const v = seleccion?.valor;
  if (!Number.isInteger(v) || v < 1 || v > 3) {
    throw crearError('SELECCION_INVALIDA', 'El valor debe ser 1, 2 o 3.');
  }
  return v;
}

function rango(desde, hasta) {
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

function filtrar1a36(fn) {
  return rango(1, 36).filter(fn);
}

function exigirCantidad(nums, cantidad, nombre) {
  if (nums.length !== cantidad) {
    throw crearError('SELECCION_INVALIDA', `La apuesta "${nombre}" requiere exactamente ${cantidad} número(s).`);
  }
}

function splitValido([a, b]) {
  if (a >= 1 && b <= 36) {
    const mismaFila = Math.floor((a - 1) / 3) === Math.floor((b - 1) / 3);
    return (b - a === 1 && mismaFila) || b - a === 3;
  }
  return SPLITS_ESPECIALES.has(`${a}-${b}`);
}

// Devuelve el arreglo de números que cubre la apuesta.
// Lanza un error con .code = 'SELECCION_INVALIDA' o 'TIPO_APUESTA_DESCONOCIDO'.
export function numerosCubiertos(nombreTipo, seleccion) {
  switch (nombreTipo) {
    case 'pleno': {
      const nums = leerNumeros(seleccion);
      exigirCantidad(nums, 1, 'pleno');
      return nums;
    }
    case 'split': {
      const nums = leerNumeros(seleccion);
      exigirCantidad(nums, 2, 'split');
      if (!splitValido(nums)) {
        throw crearError('SELECCION_INVALIDA', 'Los números del split no son vecinos en la mesa.');
      }
      return nums;
    }
    case 'calle': {
      const nums = leerNumeros(seleccion);
      exigirCantidad(nums, 3, 'calle');
      const [a, b, c] = nums;
      if (!(a >= 1 && c <= 36 && a % 3 === 1 && b === a + 1 && c === a + 2)) {
        throw crearError('SELECCION_INVALIDA', 'Los números no forman una calle (fila de 3) válida.');
      }
      return nums;
    }
    case 'esquina': {
      const nums = leerNumeros(seleccion);
      exigirCantidad(nums, 4, 'esquina');
      const [a, b, c, d] = nums;
      if (!(a >= 1 && d <= 36 && a % 3 !== 0 && b === a + 1 && c === a + 3 && d === a + 4)) {
        throw crearError('SELECCION_INVALIDA', 'Los números no forman una esquina válida.');
      }
      return nums;
    }
    case 'docena': {
      const v = leerValor(seleccion);
      return rango((v - 1) * 12 + 1, v * 12);
    }
    case 'columna': {
      const v = leerValor(seleccion);
      return filtrar1a36((n) => n % 3 === v % 3); // columna 1: n%3=1, 2: n%3=2, 3: n%3=0
    }
    case 'rojo':
      return filtrar1a36((n) => colorDe(n) === 'rojo');
    case 'negro':
      return filtrar1a36((n) => colorDe(n) === 'negro');
    case 'par':
      return filtrar1a36((n) => n % 2 === 0);
    case 'impar':
      return filtrar1a36((n) => n % 2 === 1);
    case 'bajo':
      return rango(1, 18);
    case 'alto':
      return rango(19, 36);
    default:
      throw crearError('TIPO_APUESTA_DESCONOCIDO', `Tipo de apuesta no soportado: ${nombreTipo}`);
  }
}

// ---------- Resolución de apuestas ----------

export function validarSeleccion(nombreTipo, seleccion) {
  numerosCubiertos(nombreTipo, seleccion); // lanza error si es inválida
  return true;
}

export function apuestaGana(nombreTipo, seleccion, numeroGanador) {
  return numerosCubiertos(nombreTipo, seleccion).includes(numeroGanador);
}

// Premio total a acreditar: lo apostado + la ganancia (monto * (multiplicador + 1)).
// pg devuelve los NUMERIC como texto, por eso se convierte con Number().
export function calcularPremio(monto, multiplicadorPago) {
  const centavos = Math.round(Number(monto) * 100);
  return Math.round(centavos * (Number(multiplicadorPago) + 1)) / 100;
}