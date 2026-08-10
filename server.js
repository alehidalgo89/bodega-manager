const express = require('express');
const cors = require('cors');
const pg = require('pg');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Test de conexión simple
app.get('/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Crear todas las tablas
app.get('/setup', async (req, res) => {
    try {
        console.log('Iniciando setup de base de datos...');

        // 1. Crear tabla paises
        await pool.query(`
            CREATE TABLE IF NOT EXISTS paises (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL UNIQUE,
                codigo_iso VARCHAR(2)
            )
        `);
        console.log('✓ Tabla paises creada');

        // 2. Crear tabla regiones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS regiones (
                id SERIAL PRIMARY KEY,
                pais_id INTEGER NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
                nombre VARCHAR(100) NOT NULL,
                UNIQUE(pais_id, nombre)
            )
        `);
        console.log('✓ Tabla regiones creada');

        // 3. Crear tabla tipos_vino
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tipos_vino (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) NOT NULL UNIQUE
            )
        `);
        console.log('✓ Tabla tipos_vino creada');

        // 4. Crear tabla zonas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS zonas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(5) NOT NULL UNIQUE,
                columnas INTEGER NOT NULL,
                filas INTEGER NOT NULL
            )
        `);
        console.log('✓ Tabla zonas creada');

        // 5. Crear tabla ubicaciones
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ubicaciones (
                id SERIAL PRIMARY KEY,
                zona_id INTEGER NOT NULL REFERENCES zonas(id),
                columna INTEGER NOT NULL,
                fila INTEGER NOT NULL,
                disponible BOOLEAN DEFAULT TRUE,
                UNIQUE(zona_id, columna, fila)
            )
        `);
        console.log('✓ Tabla ubicaciones creada');

        // 6. Crear tabla vinos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vinos (
                id SERIAL PRIMARY KEY,
                codigo_qr VARCHAR(255) NOT NULL UNIQUE,
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
            )
        `);
        console.log('✓ Tabla vinos creada');

        // 7. Crear tabla movimientos
        await pool.query(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id SERIAL PRIMARY KEY,
                vino_id INTEGER NOT NULL REFERENCES vinos(id),
                tipo_movimiento VARCHAR(20) NOT NULL,
                cantidad INTEGER NOT NULL,
                fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notas TEXT
            )
        `);
        console.log('✓ Tabla movimientos creada');

        // 8. Crear tabla configuracion
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                nombre_bodega VARCHAR(150) DEFAULT 'Bodega de Candinho',
                columnas_por_zona TEXT,
                filas_por_zona INTEGER DEFAULT 20,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✓ Tabla configuracion creada');

        // Limpiar datos previos (excepto tipos_vino que son constantes)
        await pool.query('DELETE FROM paises');
        await pool.query('DELETE FROM tipos_vino');
        await pool.query('DELETE FROM zonas');

        // Insertar tipos de vino
        await pool.query(`
            INSERT INTO tipos_vino (nombre) VALUES 
            ('Tinto'), ('Blanco'), ('Rosado')
            ON CONFLICT DO NOTHING
        `);
        console.log('✓ Tipos de vino insertados');

        // Insertar países
        const paises_sql = `
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
            ('Rumania', 'RO')
            ON CONFLICT DO NOTHING
        `;
        await pool.query(paises_sql);
        console.log('✓ Países insertados');

        // Insertar regiones
        const regiones_sql = `
            INSERT INTO regiones (pais_id, nombre) VALUES
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Champagne'),
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Bordeaux'),
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Burgundy'),
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Loire'),
            ((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Toscana'),
            ((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Piamonte'),
            ((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Rioja'),
            ((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Ribera del Duero'),
            ((SELECT id FROM paises WHERE codigo_iso = 'AT'), 'Wachau'),
            ((SELECT id FROM paises WHERE codigo_iso = 'HR'), 'Dalmacia')
            ON CONFLICT DO NOTHING
        `;
        await pool.query(regiones_sql);
        console.log('✓ Regiones insertadas');

        // Insertar zonas (A1, A2, B1, B2, C1, C2, D1, D2)
        await pool.query(`
            INSERT INTO zonas (nombre, columnas, filas) VALUES
            ('A1', 20, 20), ('A2', 20, 20),
            ('B1', 30, 20), ('B2', 30, 20),
            ('C1', 30, 20), ('C2', 30, 20),
            ('D1', 20, 20), ('D2', 20, 20)
            ON CONFLICT DO NOTHING
        `);
        console.log('✓ Zonas insertadas');

        // Generar ubicaciones para cada zona
        const zonas_config = [
            { nombre: 'A1', cols: 20, filas: 20 },
            { nombre: 'A2', cols: 20, filas: 20 },
            { nombre: 'B1', cols: 30, filas: 20 },
            { nombre: 'B2', cols: 30, filas: 20 },
            { nombre: 'C1', cols: 30, filas: 20 },
            { nombre: 'C2', cols: 30, filas: 20 },
            { nombre: 'D1', cols: 20, filas: 20 },
            { nombre: 'D2', cols: 20, filas: 20 }
        ];

        for (const zona of zonas_config) {
            const zonaResult = await pool.query('SELECT id FROM zonas WHERE nombre = $1', [zona.nombre]);
            if (zonaResult.rows.length > 0) {
                const zona_id = zonaResult.rows[0].id;
                for (let col = 1; col <= zona.cols; col++) {
                    for (let fila = 1; fila <= zona.filas; fila++) {
                        await pool.query(
                            'INSERT INTO ubicaciones (zona_id, columna, fila, disponible) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING',
                            [zona_id, col, fila]
                        );
                    }
                }
            }
        }
        console.log('✓ Ubicaciones generadas (4000 total)');

        // Insertar configuración
        await pool.query(`
            INSERT INTO configuracion (nombre_bodega, columnas_por_zona) VALUES
            ('Bodega de Candinho', 'A1:20,A2:20,B1:30,B2:30,C1:30,C2:30,D1:20,D2:20')
            ON CONFLICT DO NOTHING
        `);
        console.log('✓ Configuración insertada');

        res.json({ 
            success: true, 
            message: 'Base de datos completamente inicializada',
            details: {
                tablas: 8,
                paises: 15,
                regiones: 10,
                tipos_vino: 3,
                zonas: 8,
                ubicaciones: 4000,
                capacidad_total: 4000
            }
        });
    } catch (err) {
        console.error('Error:', err.message);
        res.json({ success: false, error: err.message });
    }
});

// Obtener países
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener regiones de un país
app.get('/api/paises/:id/regiones', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener tipos de vino
app.get('/api/tipos-vino', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener zonas
app.get('/api/zonas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM zonas ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener todos los vinos
app.get('/api/vinos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, 
                   tv.nombre as tipo_nombre,
                   p.nombre as pais_nombre,
                   r.nombre as region_nombre,
                   z.nombre as zona_nombre
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            ORDER BY v.bodega, v.ano DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Crear un nuevo vino
app.post('/api/vinos', async (req, res) => {
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, notas } = req.body;
        
        // Generar código QR único
        const codigo_qr = require('crypto').randomBytes(16).toString('hex');
        
        // Buscar ubicación disponible
        const ubicacion = await pool.query(
            'SELECT id FROM ubicaciones WHERE disponible = true LIMIT 1'
        );
        
        if (ubicacion.rows.length === 0) {
            return res.json({ error: 'No hay ubicaciones disponibles' });
        }
        
        const ubicacion_id = ubicacion.rows[0].id;
        
        // Insertar vino
        const result = await pool.query(
            `INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, ubicacion_id, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, cantidad || 1, ubicacion_id, notas]
        );
        
        // Marcar ubicación como no disponible
        await pool.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ubicacion_id]);
        
        // Registrar movimiento
        await pool.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad) VALUES ($1, $2, $3)',
            [result.rows[0].id, 'Entrada', cantidad || 1]
        );
        
        res.json({ success: true, vino: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Reportes
app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total = await pool.query('SELECT COALESCE(SUM(cantidad), 0) as total FROM vinos');
        const por_tipo = await pool.query(`
            SELECT tv.nombre, COALESCE(SUM(v.cantidad), 0) as total
            FROM tipos_vino tv
            LEFT JOIN vinos v ON tv.id = v.tipo_vino_id
            GROUP BY tv.nombre
        `);
        const por_pais = await pool.query(`
            SELECT p.nombre, COALESCE(SUM(v.cantidad), 0) as total
            FROM paises p
            LEFT JOIN vinos v ON p.id = v.pais_id
            GROUP BY p.nombre
            ORDER BY total DESC
            LIMIT 10
        `);
        
        res.json({
            total_botellas: total.rows[0].total,
            por_tipo: por_tipo.rows,
            por_pais: por_pais.rows
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Página principal
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Bodega de Candinho</title>
    <style>
        body { 
            font-family: Arial; 
            background: #1a1a1a; 
            color: white; 
            padding: 40px;
            text-align: center;
        }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: #D4AF37; }
        button { 
            background: #4CAF50; 
            color: white; 
            border: none; 
            padding: 10px 15px; 
            cursor: pointer;
            border-radius: 5px;
            margin: 5px;
            font-size: 14px;
        }
        button:hover { background: #45a049; }
        button:active { background: #3d8b40; }
        .result { 
            background: #333; 
            padding: 20px; 
            margin-top: 20px; 
            border-radius: 5px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍷 Bodega de Candinho</h1>
        <p>Sistema de Gestión de Inventario</p>
        
        <button onclick="setup()">1. Inicializar BD</button>
        <button onclick="test()">2. Probar Conexión</button>
        <button onclick="getPaises()">3. Obtener Países</button>
        <br><br>
        <button onclick="getTipos()">Tipos Vino</button>
        <button onclick="getZonas()">Zonas</button>
        <button onclick="getVinos()">Ver Vinos</button>
        <button onclick="getReportes()">Reportes</button>
        
        <div id="result" class="result" style="display:none;"></div>
    </div>

    <script>
        function setup() {
            fetch('/setup')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function test() {
            fetch('/test')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getPaises() {
            fetch('/api/paises')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getTipos() {
            fetch('/api/tipos-vino')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getZonas() {
            fetch('/api/zonas')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getVinos() {
            fetch('/api/vinos')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getReportes() {
            fetch('/api/reportes/resumen')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function show(data) {
            const result = document.getElementById('result');
            result.textContent = JSON.stringify(data, null, 2);
            result.style.display = 'block';
        }
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('Servidor en puerto ' + PORT);
});
