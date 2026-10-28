-- 1. Tablas independientes (Catálogos y roles)
CREATE TABLE rol (
    id_rol SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL -- Ej: 'jugador', 'admin'
);

CREATE TABLE tipo_transaccion (
    id_tipo_transaccion SERIAL PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL, -- 'deposito', 'retiro', 'apuesta', 'premio', 'bono'
    naturaleza VARCHAR(10) NOT NULL -- 'credito' o 'debito'
);

CREATE TABLE juego (
    id_juego SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL, -- Ej: 'ruleta_americana'
    nombre VARCHAR(100) NOT NULL,
    apuesta_min NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    apuesta_max NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    activo BOOLEAN DEFAULT TRUE
);

CREATE TABLE promocion (
    id_promocion SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    monto_maximo NUMERIC(12, 2) NOT NULL,
    multiplicador_rollover NUMERIC(5, 2) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activa BOOLEAN DEFAULT TRUE
);

-- 2. Tabla de Usuarios
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    id_rol INT REFERENCES rol(id_rol),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    stripe_customer_id VARCHAR(255) UNIQUE, -- Opcional hasta que haga el primer depósito
    fecha_nacimiento DATE NOT NULL,
    estado VARCHAR(20) DEFAULT 'activo',
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Billetera y Bonos (Dependen del usuario)
CREATE TABLE billetera (
    id_billetera SERIAL PRIMARY KEY,
    id_usuario INT UNIQUE NOT NULL REFERENCES usuario(id_usuario) ON DELETE CASCADE,
    saldo_real NUMERIC(12, 2) DEFAULT 0.00 NOT NULL,
    saldo_bono NUMERIC(12, 2) DEFAULT 0.00 NOT NULL
);

CREATE TABLE bono_usuario (
    id_bono SERIAL PRIMARY KEY,
    id_usuario INT REFERENCES usuario(id_usuario),
    id_promocion INT REFERENCES promocion(id_promocion),
    monto NUMERIC(12, 2) NOT NULL,
    requisito_apuesta NUMERIC(12, 2) NOT NULL, -- Lo que debe apostar para liberar el bono (Rollover)
    progreso NUMERIC(12, 2) DEFAULT 0.00,
    estado VARCHAR(20) DEFAULT 'activo', -- 'activo', 'completado', 'expirado', 'cancelado'
    fecha_otorgado TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Transacciones y Pagos
CREATE TABLE transaccion (
    id_transaccion SERIAL PRIMARY KEY,
    id_billetera INT REFERENCES billetera(id_billetera),
    id_tipo_transaccion INT REFERENCES tipo_transaccion(id_tipo_transaccion),
    monto NUMERIC(12, 2) NOT NULL,
    -- Auditoría financiera adaptada a la división de saldos:
    saldo_real_posterior NUMERIC(12, 2) NOT NULL,
    saldo_bono_posterior NUMERIC(12, 2) NOT NULL,
    estado VARCHAR(20) DEFAULT 'completado',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pago (
    id_pago SERIAL PRIMARY KEY,
    id_transaccion INT REFERENCES transaccion(id_transaccion),
    tipo VARCHAR(20) NOT NULL, -- 'deposito', 'retiro'
    monto NUMERIC(12, 2) NOT NULL,
    moneda VARCHAR(3) DEFAULT 'USD', -- Lo dejamos para el registro exacto de Stripe
    stripe_payment_intent_id VARCHAR(255),
    stripe_event_id VARCHAR(255) UNIQUE, -- Evita procesar webhooks duplicados
    estado VARCHAR(20) DEFAULT 'pendiente',
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion TIMESTAMP
);

-- 5. Lógica de Juegos (Dependen de Juego)
CREATE TABLE tipo_apuesta (
    id_tipo_apuesta SERIAL PRIMARY KEY,
    id_juego INT REFERENCES juego(id_juego),
    nombre VARCHAR(50) NOT NULL, -- 'rojo', 'pleno', 'docena'
    multiplicador_pago NUMERIC(5, 2) NOT NULL
);

CREATE TABLE ronda (
    id_ronda SERIAL PRIMARY KEY,
    id_juego INT REFERENCES juego(id_juego),
    estado VARCHAR(20) DEFAULT 'abierta', -- 'abierta', 'cerrada', 'pagada'
    resultado JSONB, -- Ej: {"numero_ganador": 17, "color": "negro"}
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP
);

-- 6. Apuestas (El corazón del casino)
CREATE TABLE apuesta (
    id_apuesta SERIAL PRIMARY KEY,
    id_ronda INT REFERENCES ronda(id_ronda),
    id_usuario INT REFERENCES usuario(id_usuario),
    id_tipo_apuesta INT REFERENCES tipo_apuesta(id_tipo_apuesta),
    id_transaccion_apuesta INT REFERENCES transaccion(id_transaccion), -- Descuento del saldo al apostar
    id_transaccion_premio INT REFERENCES transaccion(id_transaccion), -- Ingreso del saldo al ganar (Nulo si pierde)
    monto NUMERIC(12, 2) NOT NULL,
    seleccion JSONB NOT NULL, -- Ej: {"numeros": [17]}
    monto_premio NUMERIC(12, 2) DEFAULT 0.00,
    estado VARCHAR(20) DEFAULT 'pendiente', -- 'pendiente', 'ganada', 'perdida'
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);