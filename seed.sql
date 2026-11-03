-- seed.sql: datos iniciales del módulo de juegos (ruleta americana)
-- Se puede correr varias veces sin duplicar datos.
-- Convención: el 00 se representa como 37 (números válidos: 0 a 37).

-- 1. Juego
INSERT INTO juego (codigo, nombre, apuesta_min, apuesta_max, activo)
VALUES ('ruleta_americana', 'Ruleta Americana', 10.00, 5000.00, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- 2. Tipos de apuesta (multiplicador_pago = ganancia por cada 1 apostado)
INSERT INTO tipo_apuesta (id_juego, nombre, multiplicador_pago)
SELECT j.id_juego, t.nombre, t.multiplicador
FROM juego j
CROSS JOIN (VALUES
    ('pleno',   35.00),
    ('split',   17.00),
    ('calle',   11.00),
    ('esquina',  8.00),
    ('docena',   2.00),
    ('columna',  2.00),
    ('rojo',     1.00),
    ('negro',    1.00),
    ('par',      1.00),
    ('impar',    1.00),
    ('bajo',     1.00),
    ('alto',     1.00)
) AS t(nombre, multiplicador)
WHERE j.codigo = 'ruleta_americana'
  AND NOT EXISTS (
      SELECT 1
      FROM tipo_apuesta ta
      WHERE ta.id_juego = j.id_juego
        AND ta.nombre = t.nombre
  );