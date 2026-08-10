// ============================================
// BODEGA DE CANDINHO - SERVIDOR BACKEND
// Node.js + Express + PostgreSQL
// ============================================

const express = require('express');
const cors = require('cors');
const pg = require('pg');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a PostgreSQL
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/bodega_candinho'
});

// ============================================
// INICIALIZAR BASE DE DATOS
// ============================================

app.get('/init-db', async (req, res) => {
    const client = await pool.connect();
    try {
        // Crear tablas
        await client.query(`
            CREATE TABLE IF NOT EXISTS paises (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) UNIQUE NOT NULL,
                codigo_iso VARCHAR(2) UNIQUE NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS regiones (
                id SERIAL PRIMARY KEY,
                pais_id INTEGER NOT NULL REFERENCES paises(id) ON DELETE CASCADE,
                nombre VARCHAR(100) NOT NULL,
                UNIQUE(pais_id, nombre)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS tipos_vino (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS zonas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(5) UNIQUE NOT NULL,
                columnas INTEGER NOT NULL,
                filas INTEGER NOT NULL
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS ubicaciones (
                id SERIAL PRIMARY KEY,
                zona_id INTEGER NOT NULL REFERENCES zonas(id),
                columna INTEGER NOT NULL,
                fila INTEGER NOT NULL,
                disponible BOOLEAN DEFAULT TRUE,
                UNIQUE(zona_id, columna, fila)
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS vinos (
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
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id SERIAL PRIMARY KEY,
                vino_id INTEGER NOT NULL REFERENCES vinos(id),
                tipo_movimiento VARCHAR(20) NOT NULL,
                cantidad INTEGER NOT NULL,
                fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                notas TEXT
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                nombre_bodega VARCHAR(150) DEFAULT 'Bodega de Candinho',
                columnas_por_zona TEXT,
                filas_por_zona INTEGER DEFAULT 20,
                fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Insertar tipos de vino
        await client.query(`
            INSERT INTO tipos_vino (nombre) VALUES ('Tinto'), ('Blanco'), ('Rosado')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // Insertar países
        const paises = [
            ['Francia', 'FR'], ['Italia', 'IT'], ['España', 'ES'], ['Austria', 'AT'],
            ['Croacia', 'HR'], ['Alemania', 'DE'], ['Portugal', 'PT'], ['Argentina', 'AR'],
            ['Chile', 'CL'], ['Australia', 'AU'], ['Sudáfrica', 'ZA'], ['Nueva Zelanda', 'NZ'],
            ['Estados Unidos', 'US'], ['Hungría', 'HU'], ['Rumania', 'RO']
        ];

        for (const [nombre, codigo] of paises) {
            await client.query(
                'INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [nombre, codigo]
            );
        }

        // Insertar regiones de Francia
        const frId = (await client.query('SELECT id FROM paises WHERE codigo_iso = $1', ['FR'])).rows[0].id;
        const regionesFr = ['Champagne', 'Bordeaux', 'Burgundy', 'Loire', 'Alsace', 'Provence', 'Rhône'];
        for (const region of regionesFr) {
            await client.query(
                'INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [frId, region]
            );
        }

        // Insertar regiones de Italia
        const itId = (await client.query('SELECT id FROM paises WHERE codigo_iso = $1', ['IT'])).rows[0].id;
        const regionesIt = ['Toscana', 'Piamonte', 'Venecia', 'Sicilia', 'Campania'];
        for (const region of regionesIt) {
            await client.query(
                'INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [itId, region]
            );
        }

        // Insertar regiones de España
        const esId = (await client.query('SELECT id FROM paises WHERE codigo_iso = $1', ['ES'])).rows[0].id;
        const regionesEs = ['Rioja', 'Ribera del Duero', 'La Mancha', 'Penedès', 'Priorat'];
        for (const region of regionesEs) {
            await client.query(
                'INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [esId, region]
            );
        }

        // Insertar regiones de Austria
        const atId = (await client.query('SELECT id FROM paises WHERE codigo_iso = $1', ['AT'])).rows[0].id;
        const regionesAt = ['Wachau', 'Danubio', 'Estiria'];
        for (const region of regionesAt) {
            await client.query(
                'INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [atId, region]
            );
        }

        // Insertar regiones de Croacia
        const hrId = (await client.query('SELECT id FROM paises WHERE codigo_iso = $1', ['HR'])).rows[0].id;
        const regionesHr = ['Dalmacia', 'Istria', 'Panonia'];
        for (const region of regionesHr) {
            await client.query(
                'INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [hrId, region]
            );
        }

        // Insertar zonas
        const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
        const columas_por_zona = { 'A1': 20, 'A2': 20, 'B1': 30, 'B2': 30, 'C1': 30, 'C2': 30, 'D1': 20, 'D2': 20 };

        for (const zona of zonas) {
            await client.query(
                'INSERT INTO zonas (nombre, columnas, filas) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                [zona, columas_por_zona[zona], 20]
            );
        }

        // Generar ubicaciones
        await client.query('DELETE FROM ubicaciones');
        for (const zona of zonas) {
            const zoneRow = await client.query('SELECT id FROM zonas WHERE nombre = $1', [zona]);
            if (zoneRow.rows.length > 0) {
                const zoneId = zoneRow.rows[0].id;
                const cols = columas_por_zona[zona];
                for (let col = 1; col <= cols; col++) {
                    for (let fil = 1; fil <= 20; fil++) {
                        await client.query(
                            'INSERT INTO ubicaciones (zona_id, columna, fila, disponible) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING',
                            [zoneId, col, fil]
                        );
                    }
                }
            }
        }

        // Insertar configuración
        await client.query(
            'INSERT INTO configuracion (nombre_bodega, columnas_por_zona) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            ['Bodega de Candinho', 'A1:20,A2:20,B1:30,B2:30,C1:30,C2:30,D1:20,D2:20']
        );

        res.json({ 
            success: true, 
            message: 'Base de datos inicializada correctamente',
            info: 'Tablas creadas, datos precargados, 4000 ubicaciones disponibles'
        });
    } catch (err) {
        res.status(500).json({ 
            success: false,
            error: err.message 
        });
    } finally {
        client.release();
    }
});

// ============================================
// RUTAS DE PAÍSES Y REGIONES
// ============================================

app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/paises/:pais_id/regiones', async (req, res) => {
    try {
        const { pais_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre',
            [pais_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE TIPOS DE VINO
// ============================================

app.get('/api/tipos-vino', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE ZONAS
// ============================================

app.get('/api/zonas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM zonas ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE VINOS
// ============================================

app.post('/api/vinos', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, cantidad_minima, notas } = req.body;

        if (!tipo_vino_id || !pais_id || !bodega || !ano) {
            return res.status(400).json({ error: 'Datos requeridos faltantes' });
        }

        const codigo_qr = uuidv4();

        const ubicacion = await client.query(
            'SELECT id FROM ubicaciones WHERE disponible = true LIMIT 1'
        );

        if (ubicacion.rows.length === 0) {
            return res.status(400).json({ error: 'No hay ubicaciones disponibles en la bodega' });
        }

        const ubicacion_id = ubicacion.rows[0].id;

        const result = await client.query(
            `INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, cantidad_minima, ubicacion_id, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, cantidad || 1, cantidad_minima || 0, ubicacion_id, notas || null]
        );

        await client.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ubicacion_id]);

        await client.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad) VALUES ($1, $2, $3)',
            [result.rows[0].id, 'Entrada', cantidad || 1]
        );

        const qr_image = await QRCode.toDataURL(codigo_qr);

        res.json({
            ...result.rows[0],
            qr_image
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

app.get('/api/vinos', async (req, res) => {
    try {
        const { tipo, pais, region, ano, bodega } = req.query;
        let query = `
            SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE 1=1
        `;
        const params = [];

        if (tipo) {
            query += ` AND tv.id = $${params.length + 1}`;
            params.push(tipo);
        }
        if (pais) {
            query += ` AND p.id = $${params.length + 1}`;
            params.push(pais);
        }
        if (region) {
            query += ` AND r.id = $${params.length + 1}`;
            params.push(region);
        }
        if (ano) {
            query += ` AND v.ano = $${params.length + 1}`;
            params.push(ano);
        }
        if (bodega) {
            query += ` AND v.bodega ILIKE $${params.length + 1}`;
            params.push(`%${bodega}%`);
        }

        query += ' ORDER BY tv.nombre, r.nombre, v.ano DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/vinos/qr/:codigo_qr', async (req, res) => {
    try {
        const { codigo_qr } = req.params;
        const result = await pool.query(
            `SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE v.codigo_qr = $1`,
            [codigo_qr]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/vinos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE v.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/vinos/:id/salida', async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad, notas } = req.body;

        const vino = await pool.query('SELECT * FROM vinos WHERE id = $1', [id]);
        if (vino.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        const cantidad_actual = vino.rows[0].cantidad;
        const nueva_cantidad = cantidad_actual - cantidad;

        if (nueva_cantidad < 0) {
            return res.status(400).json({ error: 'Cantidad insuficiente' });
        }

        const result = await pool.query(
            'UPDATE vinos SET cantidad = $1 WHERE id = $2 RETURNING *',
            [nueva_cantidad, id]
        );

        await pool.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad, notas) VALUES ($1, $2, $3, $4)',
            [id, 'Salida', cantidad, notas || null]
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE MOVIMIENTOS
// ============================================

app.get('/api/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.*,
                v.codigo_qr,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                v.bodega
            FROM movimientos m
            JOIN vinos v ON m.vino_id = v.id
            JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            JOIN paises p ON v.pais_id = p.id
            ORDER BY m.fecha_movimiento DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE REPORTES
// ============================================

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total_botellas = await pool.query('SELECT COALESCE(SUM(cantidad), 0) as total FROM vinos');
        const por_tipo = await pool.query(`
            SELECT tv.nombre, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM tipos_vino tv
            LEFT JOIN vinos v ON tv.id = v.tipo_vino_id
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `);
        const por_pais = await pool.query(`
            SELECT p.nombre, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM paises p
            LEFT JOIN vinos v ON p.id = v.pais_id
            GROUP BY p.id, p.nombre
            ORDER BY cantidad DESC
            LIMIT 10
        `);
        const por_region = await pool.query(`
            SELECT r.nombre, p.nombre as pais, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM regiones r
            LEFT JOIN paises p ON r.pais_id = p.id
            LEFT JOIN vinos v ON r.id = v.region_id
            GROUP BY r.id, r.nombre, p.nombre
            ORDER BY cantidad DESC
            LIMIT 15
        `);

        res.json({
            total_botellas: total_botellas.rows[0].total,
            por_tipo: por_tipo.rows,
            por_pais: por_pais.rows,
            por_region: por_region.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE CONFIGURACIÓN
// ============================================

app.get('/api/configuracion', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM configuracion LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// PÁGINA DE INICIO HTML
// ============================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodega de Candinho</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #ffffff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            text-align: center;
            background: rgba(45, 45, 45, 0.8);
            padding: 50px;
            border-radius: 15px;
            border: 2px solid #D4AF37;
            max-width: 600px;
        }
        h1 { font-size: 2.5em; color: #D4AF37; margin-bottom: 20px; }
        .emoji { font-size: 4em; margin-bottom: 20px; }
        p { font-size: 1.1em; color: #b0b0b0; margin-bottom: 30px; line-height: 1.6; }
        .status {
            background: rgba(76, 175, 80, 0.2);
            border: 1px solid #4CAF50;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            color: #4CAF50;
            font-weight: bold;
        }
        .features {
            text-align: left;
            background: rgba(212, 175, 55, 0.1);
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .features h3 { color: #D4AF37; margin-bottom: 10px; }
        .features ul { list-style: none; }
        .features li { padding: 5px 0; color: #b0b0b0; }
        .features li:before { content: "✓ "; color: #4CAF50; font-weight: bold; margin-right: 8px; }
        .api-info {
            background: rgba(139, 0, 0, 0.1);
            border: 1px solid #8B0000;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
        .api-info h3 { color: #D4AF37; margin-bottom: 10px; }
        .endpoints { display: grid; gap: 10px; margin-top: 10px; }
        .endpoint {
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 5px;
            text-align: left;
            font-size: 0.9em;
            border-left: 3px solid #D4AF37;
        }
        .endpoint code { display: block; margin-top: 5px; color: #4CAF50; }
        .test-api {
            background: rgba(76, 175, 80, 0.1);
            border: 1px solid #4CAF50;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }
        .test-api h3 { color: #4CAF50; margin-bottom: 10px; }
        .test-api button {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 10px;
            font-weight: bold;
        }
        .test-api button:hover { background: #45a049; }
        .result {
            background: rgba(0, 0, 0, 0.2);
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
            text-align: left;
            max-height: 200px;
            overflow-y: auto;
            font-size: 0.85em;
            color: #4CAF50;
            font-family: monospace;
        }
        .result.error { color: #ff6b6b; border: 1px solid #ff6b6b; }
    </style>
</head>
<body>
    <div class="container">
        <div class="emoji">🍷</div>
        <h1>Bodega de Candinho</h1>
        <p>Sistema de Gestión de Inventario de Vinos</p>
        
        <div class="status">✓ Servidor Activo y Funcionando</div>
        
        <div class="features">
            <h3>Características</h3>
            <ul>
                <li>Registro de vinos con detalles completos</li>
                <li>Generación automática de códigos QR</li>
                <li>Búsqueda avanzada por tipo, región y año</li>
                <li>Ubicación exacta de cada botella</li>
                <li>Reportes estadísticos</li>
                <li>8 zonas de almacenamiento</li>
            </ul>
        </div>
        
        <div class="api-info">
            <h3>🔌 API Endpoints</h3>
            <div class="endpoints">
                <div class="endpoint">Obtener Países<code>GET /api/paises</code></div>
                <div class="endpoint">Obtener Vinos<code>GET /api/vinos</code></div>
                <div class="endpoint">Crear Vino<code>POST /api/vinos</code></div>
                <div class="endpoint">Reportes<code>GET /api/reportes/resumen</code></div>
                <div class="endpoint">Movimientos<code>GET /api/movimientos</code></div>
            </div>
        </div>

        <div class="test-api">
            <h3>🧪 Probar API</h3>
            <button onclick="testAPI()">Obtener Países</button>
            <div id="result"></div>
        </div>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #444;">
            <p style="font-size: 0.9em; color: #888;">
                🚀 Desplegado en Heroku
            </p>
        </div>
    </div>

    <script>
        function testAPI() {
            var resultDiv = document.getElementById('result');
            resultDiv.innerHTML = 'Conectando...';
            resultDiv.className = '';

            fetch('/api/paises')
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    var html = 'API Funcionando - Paises: ' + data.length;
                    resultDiv.innerHTML = html;
                    resultDiv.className = '';
                })
                .catch(function(error) {
                    resultDiv.innerHTML = 'Error: ' + error.message;
                    resultDiv.className = 'error';
                });
        }
    </script>
</body>
</html>
    `);
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('Servidor Bodega de Candinho corriendo en puerto ' + PORT);
});
