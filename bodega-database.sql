-- ============================================
-- BODEGA DE CANDINHO - SISTEMA DE INVENTARIO
-- Base de Datos PostgreSQL
-- ============================================

-- Tabla de Países
CREATE TABLE paises (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    codigo_iso VARCHAR(2) UNIQUE NOT NULL
);

-- Tabla de Regiones por País
CREATE TABLE regiones (
    id SERIAL PRIMARY KEY,
    pais_id INTEGER NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
    nombre VARCHAR(100) NOT NULL,
    UNIQUE(pais_id, nombre)
);

-- Tabla de Tipos de Vino
CREATE TABLE tipos_vino (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- Tabla de Zonas de la Bodega
CREATE TABLE zonas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(5) UNIQUE NOT NULL,
    columnas INTEGER NOT NULL,
    filas INTEGER NOT NULL
);

-- Tabla de Ubicaciones en la Bodega
CREATE TABLE ubicaciones (
    id SERIAL PRIMARY KEY,
    zona_id INTEGER NOT NULL REFERENCES zonas(id),
    columna INTEGER NOT NULL,
    fila INTEGER NOT NULL,
    disponible BOOLEAN DEFAULT TRUE,
    UNIQUE(zona_id, columna, fila)
);

-- Tabla de Vinos
CREATE TABLE vinos (
    id SERIAL PRIMARY KEY,
    codigo_qr VARCHAR(255) UNIQUE NOT NULL,
    tipo_vino_id INTEGER NOT NULL REFERENCES tipos_vino(id),
    pais_id INTEGER NOT NULL REFERENCES paises(id),
    region_id INTEGER REFERENCES regiones(id),
    bodega VARCHAR(150) NOT NULL,
    ano INTEGER NOT NULL,
    cantidad INTEGER NOT NULL DEFAULT 1,
    cantidad_minima INTEGER DEFAULT 0,
    ubicacion_id INTEGER REFERENCES ubicaciones(id),
    estado VARCHAR(20) DEFAULT 'Disponible',
    fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notas TEXT
);

-- Tabla de Movimientos (Entrada/Salida)
CREATE TABLE movimientos (
    id SERIAL PRIMARY KEY,
    vino_id INTEGER NOT NULL REFERENCES vinos(id),
    tipo_movimiento VARCHAR(20) NOT NULL CHECK (tipo_movimiento IN ('Entrada', 'Salida')),
    cantidad INTEGER NOT NULL,
    fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notas TEXT
);

-- Tabla de Configuración de la Bodega
CREATE TABLE configuracion (
    id SERIAL PRIMARY KEY,
    nombre_bodega VARCHAR(150) DEFAULT 'Bodega de Candinho',
    columnas_por_zona TEXT,
    filas_por_zona INTEGER DEFAULT 40,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INSERTAR DATOS INICIALES
-- ============================================

-- Insertar Tipos de Vino
INSERT INTO tipos_vino (nombre) VALUES 
('Tinto'),
('Blanco'),
('Rosado');

-- Insertar Países principales productores de vino
INSERT INTO paises (nombre, codigo_iso) VALUES
('Francia', 'FR'),
('Italia', 'IT'),
('España', 'ES'),
('Austria', 'AT'),
('Croacia', 'HR'),
('Alemania', 'DE'),
('Portugal', 'PT'),
('Argentina', 'AR'),
('Chile', 'CL'),
('Australia', 'AU'),
('Sudáfrica', 'ZA'),
('Nueva Zelanda', 'NZ'),
('Estados Unidos', 'US'),
('Hungría', 'HU'),
('Rumania', 'RO');

-- Insertar Regiones de Francia
INSERT INTO regiones (pais_id, nombre) VALUES
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Champagne'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Bordeaux'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Burgundy'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Loire'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Alsace'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Provence'),
((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Rhône');

-- Insertar Regiones de Italia
INSERT INTO regiones (pais_id, nombre) VALUES
((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Toscana'),
((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Piamonte'),
((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Venecia'),
((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Sicilia'),
((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Campania');

-- Insertar Regiones de España
INSERT INTO regiones (pais_id, nombre) VALUES
((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Rioja'),
((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Ribera del Duero'),
((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'La Mancha'),
((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Penedès'),
((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Priorat');

-- Insertar Regiones de Austria
INSERT INTO regiones (pais_id, nombre) VALUES
((SELECT id FROM paises WHERE codigo_iso = 'AT'), 'Wachau'),
((SELECT id FROM paises WHERE codigo_iso = 'AT'), 'Danubio'),
((SELECT id FROM paises WHERE codigo_iso = 'AT'), 'Estiria');

-- Insertar Regiones de Croacia
INSERT INTO regiones (pais_id, nombre) VALUES
((SELECT id FROM paises WHERE codigo_iso = 'HR'), 'Dalmacia'),
((SELECT id FROM paises WHERE codigo_iso = 'HR'), 'Istria'),
((SELECT id FROM paises WHERE codigo_iso = 'HR'), 'Panonia');

-- Insertar Zonas de la Bodega
INSERT INTO zonas (nombre, columnas, filas) VALUES
('A1', 20, 20),
('A2', 20, 20),
('B1', 30, 20),
('B2', 30, 20),
('C1', 30, 20),
('C2', 30, 20),
('D1', 20, 20),
('D2', 20, 20);

-- Generar ubicaciones para cada zona
INSERT INTO ubicaciones (zona_id, columna, fila)
SELECT z.id, c.col, f.fil
FROM zonas z,
     LATERAL (SELECT generate_series(1, z.columnas) AS col) c,
     LATERAL (SELECT generate_series(1, z.filas) AS fil) f;

-- Insertar Configuración
INSERT INTO configuracion (nombre_bodega, columnas_por_zona) VALUES
('Bodega de Candinho', 'A1:20,A2:20,B1:30,B2:30,C1:30,C2:30,D1:20,D2:20');

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX idx_vinos_tipo ON vinos(tipo_vino_id);
CREATE INDEX idx_vinos_pais ON vinos(pais_id);
CREATE INDEX idx_vinos_region ON vinos(region_id);
CREATE INDEX idx_vinos_estado ON vinos(estado);
CREATE INDEX idx_vinos_codigo_qr ON vinos(codigo_qr);
CREATE INDEX idx_movimientos_vino ON movimientos(vino_id);
CREATE INDEX idx_movimientos_fecha ON movimientos(fecha_movimiento);
CREATE INDEX idx_ubicaciones_zona ON ubicaciones(zona_id);
