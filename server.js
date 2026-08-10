const express = require('express');
const cors = require('cors');
const pg = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ========== SETUP ==========
app.get('/setup', async (req, res) => {
    try {
        // DROP ALL TABLES
        await pool.query('DROP TABLE IF EXISTS vino_variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_vino CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        // CREATE TABLES
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, codigo_iso VARCHAR(2))');
        await pool.query('CREATE TABLE regiones (id SERIAL PRIMARY KEY, pais_id INTEGER REFERENCES paises(id) ON DELETE CASCADE, nombre VARCHAR(100), UNIQUE(pais_id, nombre))');
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, descripcion TEXT)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(5) NOT NULL UNIQUE, columnas INTEGER, filas INTEGER)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE, columna INTEGER, fila INTEGER, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))');
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150), ano INTEGER, ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL, estado VARCHAR(20) DEFAULT \'Disponible\', fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)');
        await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, variedad_id INTEGER REFERENCES variedades(id) ON DELETE CASCADE, UNIQUE(vino_id, variedad_id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(50), razon TEXT, notas TEXT, fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

        // INSERT TIPOS DE VINO
        await pool.query('INSERT INTO tipos_vino (nombre) VALUES (\'Tinto\'), (\'Blanco\'), (\'Rosado\'), (\'Espumante\'), (\'Champagne\')');
        
        // INSERT VARIEDADES
        const variedades = ['Chardonnay', 'Pinot Noir', 'Merlot', 'Cabernet Sauvignon', 'Syrah', 'Grenache', 'Riesling', 'Sauvignon Blanc', 'Pinot Grigio', 'Tempranillo', 'Albariño', 'Prosecco', 'Moscato'];
        for (const v of variedades) {
            await pool.query('INSERT INTO variedades (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [v]);
        }
        
        // INSERT PAISES
        await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES (\'Francia\', \'FR\'), (\'Italia\', \'IT\'), (\'España\', \'ES\'), (\'Austria\', \'AT\'), (\'Alemania\', \'DE\'), (\'Portugal\', \'PT\'), (\'Argentina\', \'AR\'), (\'Chile\', \'CL\'), (\'Australia\', \'AU\'), (\'Nueva Zelanda\', \'NZ\'), (\'Estados Unidos\', \'US\')');
        
        // INSERT REGIONES
        const regiones = [
            { pais: 'Francia', regs: ['Champagne', 'Bordeaux', 'Borgoña', 'Loire', 'Rhône', 'Alsacia', 'Provence'] },
            { pais: 'Italia', regs: ['Toscana', 'Piamonte', 'Venecia', 'Sicilia', 'Umbría'] },
            { pais: 'España', regs: ['Rioja', 'Ribera del Duero', 'Priorat', 'Rías Baixas', 'Penedès'] },
            { pais: 'Austria', regs: ['Danubio', 'Estiria'] },
            { pais: 'Alemania', regs: ['Mosel', 'Rin', 'Baden', 'Württemberg'] },
            { pais: 'Portugal', regs: ['Douro', 'Alentejo', 'Bairrada', 'Verde'] },
            { pais: 'Argentina', regs: ['Mendoza', 'Salta', 'La Rioja'] },
            { pais: 'Chile', regs: ['Valle Central', 'Maule', 'Casablanca', 'Colchagua'] },
            { pais: 'Australia', regs: ['Barossa Valley', 'McLaren Vale', 'Yarra Valley', 'Margaret River'] },
            { pais: 'Nueva Zelanda', regs: ['Marlborough', 'Hawkes Bay', 'Otago'] },
            { pais: 'Estados Unidos', regs: ['Napa Valley', 'Sonoma', 'Oregon', 'Washington'] }
        ];
        
        for (const r of regiones) {
            const paisRes = await pool.query('SELECT id FROM paises WHERE nombre = $1', [r.pais]);
            if (paisRes.rows.length > 0) {
                for (const reg of r.regs) {
                    await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING', [paisRes.rows[0].id, reg]);
                }
            }
        }
        
        // INSERT ZONAS
        await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES (\'A1\', 20, 20), (\'A2\', 20, 20), (\'B1\', 30, 20), (\'B2\', 30, 20), (\'C1\', 30, 20), (\'C2\', 30, 20), (\'D1\', 20, 20), (\'D2\', 20, 20)');

        // INSERT UBICACIONES
        const zonas = [{n: 'A1', c: 20}, {n: 'A2', c: 20}, {n: 'B1', c: 30}, {n: 'B2', c: 30}, {n: 'C1', c: 30}, {n: 'C2', c: 30}, {n: 'D1', c: 20}, {n: 'D2', c: 20}];
        for (const z of zonas) {
            const zr = await pool.query('SELECT id FROM zonas WHERE nombre = $1', [z.n]);
            if (zr.rows.length > 0) {
                for (let c = 1; c <= z.c; c++) {
                    for (let f = 1; f <= 20; f++) {
                        await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [zr.rows[0].id, c, f]);
                    }
                }
            }
        }

        res.json({ success: true, message: 'Base de datos inicializada correctamente' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ========== API ENDPOINTS ==========
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/paises/:id/regiones', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/tipos-vino', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/variedades', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM variedades ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/disponibilidad', async (req, res) => {
    try {
        const disp = await pool.query('SELECT COUNT(*) as total FROM ubicaciones WHERE disponible = true');
        const ocup = await pool.query('SELECT COUNT(*) as total FROM ubicaciones WHERE disponible = false');
        const tot = await pool.query('SELECT COUNT(*) as total FROM ubicaciones');
        
        res.json({
            disponibles: parseInt(disp.rows[0].total),
            ocupadas: parseInt(ocup.rows[0].total),
            total: parseInt(tot.rows[0].total),
            porcentajeOcupado: ((parseInt(ocup.rows[0].total) / parseInt(tot.rows[0].total)) * 100).toFixed(1)
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/verificar-ubicacion', async (req, res) => {
    try {
        const { zona, col, fila } = req.query;
        const result = await pool.query('SELECT u.disponible FROM ubicaciones u JOIN zonas z ON u.zona_id = z.id WHERE z.nombre = $1 AND u.columna = $2 AND u.fila = $3', [zona, parseInt(col), parseInt(fila)]);
        
        if (result.rows.length === 0) {
            return res.json({ disponible: false, error: 'Ubicación no existe' });
        }
        
        res.json({ disponible: result.rows[0].disponible === true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/vinos', async (req, res) => {
    try {
        const result = await pool.query('SELECT v.*, tv.nombre as tipo_nombre, p.nombre as pais_nombre, r.nombre as region_nombre, z.nombre as zona_nombre, u.columna, u.fila FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN paises p ON v.pais_id = p.id LEFT JOIN regiones r ON v.region_id = r.id LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id LEFT JOIN zonas z ON u.zona_id = z.id ORDER BY v.fecha_ingreso DESC LIMIT 500');
        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/vinos/qr/:codigo', async (req, res) => {
    try {
        const result = await pool.query('SELECT v.*, tv.nombre as tipo_nombre, p.nombre as pais_nombre, r.nombre as region_nombre, z.nombre as zona_nombre, u.columna, u.fila FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN paises p ON v.pais_id = p.id LEFT JOIN regiones r ON v.region_id = r.id LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id LEFT JOIN zonas z ON u.zona_id = z.id WHERE v.codigo_qr = $1', [req.params.codigo]);
        if (result.rows.length === 0) return res.json({ error: 'No encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/vinos', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tipo_vino_id, pais_id, region_id, nombre_vino, bodega, ano, variedades, notas, zona, columna, fila } = req.body;
        
        if (!tipo_vino_id || !pais_id || !region_id || !nombre_vino || !bodega || !ano || !zona || !columna || !fila || !variedades || variedades.length === 0) {
            return res.json({ error: 'Completa todos los campos obligatorios' });
        }

        await client.query('BEGIN');
        
        // Obtener zona
        const zonaResult = await client.query('SELECT id FROM zonas WHERE nombre = $1', [zona]);
        if (zonaResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({ error: 'Zona no existe' });
        }
        const zona_id = zonaResult.rows[0].id;
        
        // Obtener ubicación con lock
        const ubResult = await client.query('SELECT id, disponible FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 LIMIT 1 FOR UPDATE', [zona_id, parseInt(columna), parseInt(fila)]);
        
        if (ubResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.json({ error: 'Ubicación no existe' });
        }
        
        if (!ubResult.rows[0].disponible) {
            await client.query('ROLLBACK');
            return res.json({ error: 'La ubicación ya está ocupada' });
        }
        
        const ub_id = ubResult.rows[0].id;
        const codigo_qr = crypto.randomBytes(16).toString('hex');
        
        // Insertar vino
        const result = await client.query('INSERT INTO vinos (codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id, notas) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ub_id, notas]);
        
        const vino_id = result.rows[0].id;
        
        // Insertar variedades
        for (const var_id of variedades) {
            await client.query('INSERT INTO vino_variedades (vino_id, variedad_id) VALUES ($1, $2)', [vino_id, parseInt(var_id)]);
        }
        
        // Marcar ubicación como ocupada
        await client.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ub_id]);
        
        // Registrar movimiento
        await client.query('INSERT INTO movimientos (vino_id, tipo_movimiento, razon) VALUES ($1, $2, $3)', [vino_id, 'Entrada', 'Registro inicial']);
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Botella registrada exitosamente',
            vino: {
                id: vino_id,
                codigo_qr: codigo_qr,
                nombre_vino: nombre_vino,
                ubicacion: {
                    zona: zona,
                    columna: columna,
                    fila: fila,
                    referencia: zona + '-' + columna + '-' + fila
                }
            }
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(e => null);
        res.json({ error: err.message });
    } finally {
        client.release();
    }
});

app.post('/api/vinos/:id/movimiento', async (req, res) => {
    try {
        const { tipo_movimiento, razon, notas } = req.body;
        const vino_id = req.params.id;

        let estado = 'Disponible';
        if (['Consumo', 'Venta'].includes(tipo_movimiento)) estado = 'Consumido';
        if (['Daño', 'Pérdida'].includes(tipo_movimiento)) estado = 'Dañado';

        await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento, razon, notas) VALUES ($1, $2, $3, $4)', [vino_id, tipo_movimiento, razon || '-', notas || '-']);

        if (['Consumo', 'Venta', 'Daño', 'Pérdida'].includes(tipo_movimiento)) {
            await pool.query('UPDATE ubicaciones SET disponible = true WHERE id = (SELECT ubicacion_id FROM vinos WHERE id = $1)', [vino_id]);
            await pool.query('UPDATE vinos SET ubicacion_id = NULL, estado = $1 WHERE id = $2', [estado, vino_id]);
        }

        res.json({ success: true, message: 'Movimiento registrado' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/movimientos', async (req, res) => {
    try {
        const result = await pool.query('SELECT m.*, v.bodega, v.ano, v.nombre_vino FROM movimientos m JOIN vinos v ON m.vino_id = v.id ORDER BY m.fecha_movimiento DESC LIMIT 200');
        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) as total FROM vinos');
        const por_tipo = await pool.query('SELECT tv.nombre, COUNT(*) as total FROM tipos_vino tv LEFT JOIN vinos v ON tv.id = v.tipo_vino_id GROUP BY tv.nombre ORDER BY total DESC');
        
        res.json({ 
            total_botellas: total.rows[0].total,
            por_tipo: por_tipo.rows
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ========== HTML ==========
const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodega de Candinho</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #1a1a1a; color: #fff; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        header { text-align: center; padding: 30px 0; border-bottom: 3px solid #D4AF37; margin-bottom: 30px; }
        h1 { font-size: 2.5em; color: #D4AF37; }
        .subtitle { color: #bbb; }
        .tabs { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .tab-btn { padding: 12px 20px; background: #4CAF50; border: none; color: white; cursor: pointer; border-radius: 5px; font-weight: bold; }
        .tab-btn.active { background: #D4AF37; color: black; }
        .tab-content { display: none; background: #2d2d2d; padding: 20px; border-radius: 5px; border: 1px solid #444; }
        .tab-content.active { display: block; }
        input, select, textarea { width: 100%; padding: 10px; margin: 10px 0; background: #333; border: 1px solid #555; color: white; border-radius: 3px; }
        label { display: block; margin-top: 15px; color: #D4AF37; font-weight: bold; }
        button { background: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 3px; cursor: pointer; font-weight: bold; }
        button:hover { background: #45a049; }
        .result { margin-top: 15px; padding: 15px; background: rgba(0,0,0,0.3); border-left: 4px solid #4CAF50; border-radius: 3px; }
        .result.error { border-left-color: #f44336; }
        .info-box { background: rgba(212,175,55,0.15); padding: 10px; margin: 15px 0; border-left: 4px solid #D4AF37; border-radius: 3px; }
        .warning-box { background: #ff9800; padding: 10px; margin: 10px 0; border-radius: 3px; }
        table { width: 100%; margin-top: 15px; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #444; }
        th { background: rgba(212,175,55,0.2); color: #D4AF37; }
        .checkbox-group { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin: 10px 0; }
        .checkbox-group label { margin: 0; display: flex; align-items: center; color: #fff; }
        .checkbox-group input[type="checkbox"] { margin-right: 10px; width: auto; }
        hr { margin: 20px 0; border: 1px solid #555; }
    </style>
</head>
<body>
    <header>
        <h1>🍷 Bodega de Candinho</h1>
        <p class="subtitle">Sistema de Gestión de Inventario de Vinos</p>
    </header>

    <div class="container">
        <div class="tabs">
            <button class="tab-btn active" onclick="showTab('movimientos')">🔄 Movimientos</button>
            <button class="tab-btn" onclick="showTab('inventario')">📚 Inventario</button>
            <button class="tab-btn" onclick="showTab('scanner')">📱 Scanner QR</button>
            <button class="tab-btn" onclick="showTab('reportes')">📊 Reportes</button>
            <button class="tab-btn" onclick="showTab('admin')">⚙️ Admin</button>
        </div>

        <div id="movimientos" class="tab-content active">
            <h2>🔄 Movimientos de Vino</h2>
            <label>Tipo de Movimiento</label>
            <select id="tipoMov" onchange="cambiarMovimiento()">
                <option value="">- Seleccionar -</option>
                <option value="Entrada">📥 Entrada (Registrar nuevas botellas)</option>
                <option value="Consumo">🍷 Consumo (Se bebió)</option>
                <option value="Venta">💰 Venta (Se vendió)</option>
                <option value="Daño">⚠️ Daño (Botella dañada)</option>
                <option value="Pérdida">❌ Pérdida (No se encontró)</option>
            </select>

            <div id="formEntrada" style="display:none;">
                <h3>📥 Registrar Entrada de Vino</h3>
                <div class="info-box" id="disponibilidadInfo">Cargando capacidad...</div>
                
                <label><strong>Información del Vino</strong></label>
                
                <label>Nombre del Vino</label>
                <input id="nombreVino" type="text" placeholder="Ej: Château Lafite, Veuve Clicquot, etc.">
                
                <label>Bodega / Productor</label>
                <input id="bodega" type="text" placeholder="Ej: Château Lafite, Moët & Chandon, etc.">
                
                <label>Año</label>
                <input id="ano" type="number" min="1900">
                
                <label>País</label>
                <select id="pais" onchange="cargarRegiones()">
                    <option value="">- Seleccionar País -</option>
                </select>
                
                <label>Región</label>
                <select id="region" onchange="cargarTiposVino()">
                    <option value="">- Seleccionar Región -</option>
                </select>
                
                <label>Tipo de Vino</label>
                <select id="tipoVino">
                    <option value="">- Seleccionar Tipo -</option>
                </select>
                
                <label><strong>Variedades de Uva (Selecciona una o más)</strong></label>
                <div id="variedadesContainer" class="checkbox-group"></div>
                
                <label>Notas</label>
                <textarea id="notasEntrada" rows="2" placeholder="Observaciones, notas de cata, etc."></textarea>
                
                <hr>
                <label><strong>📍 Ubicación en Bodega</strong></label>
                
                <label>Zona</label>
                <select id="zona" onchange="actualizarColumnasFilas()">
                    <option value="">- Seleccionar Zona -</option>
                    <option value="A1">A1 (20 cols x 20 filas)</option>
                    <option value="A2">A2 (20 cols x 20 filas)</option>
                    <option value="B1">B1 (30 cols x 20 filas)</option>
                    <option value="B2">B2 (30 cols x 20 filas)</option>
                    <option value="C1">C1 (30 cols x 20 filas)</option>
                    <option value="C2">C2 (30 cols x 20 filas)</option>
                    <option value="D1">D1 (20 cols x 20 filas)</option>
                    <option value="D2">D2 (20 cols x 20 filas)</option>
                </select>
                
                <label>Columna</label>
                <select id="columna" onchange="actualizarFilas()">
                    <option value="">- Seleccionar -</option>
                </select>
                
                <label>Fila</label>
                <select id="fila" onchange="verificarDisponibilidad()">
                    <option value="">- Seleccionar -</option>
                </select>
                
                <div id="estadoUbicacion" style="margin: 10px 0; padding: 10px; background: rgba(76,175,80,0.15); border-radius: 3px;"></div>
                
                <button onclick="registrarEntrada()">Registrar Botella</button>
                <div id="resEntrada" class="result" style="display:none;"></div>
            </div>

            <div id="formMov" style="display:none;">
                <h3 id="titMov"></h3>
                <label>Código QR</label>
                <input id="codigoQR" type="text">
                <button onclick="buscarVino()">Buscar</button>
                <div id="infoVino" style="display:none; background: rgba(76,175,80,0.1); padding: 10px; margin: 10px 0; border-left: 4px solid #4CAF50;"></div>
                <label>Razón</label>
                <textarea id="razonMov" rows="3"></textarea>
                <label>Notas</label>
                <textarea id="notasMov" rows="2"></textarea>
                <button onclick="registrarMovimiento()">Registrar</button>
                <div id="resMov" class="result" style="display:none;"></div>
            </div>

            <hr>
            <h3>Historial</h3>
            <button onclick="cargarHistorial()">Cargar Historial</button>
            <div id="historial"></div>
        </div>

        <div id="inventario" class="tab-content">
            <h2>📚 Inventario</h2>
            <button onclick="cargarInventario()">Cargar Inventario Completo</button>
            <div id="tablaInventario"></div>
        </div>

        <div id="scanner" class="tab-content">
            <h2>📱 Scanner QR</h2>
            <label>Escanea código QR</label>
            <input id="codigoQRScan" type="text" autofocus>
            <button onclick="buscarQR()">Buscar</button>
            <div id="resScanner" class="result" style="display:none;"></div>
        </div>

        <div id="reportes" class="tab-content">
            <h2>📊 Reportes</h2>
            <button onclick="cargarReportes()">Cargar Reportes</button>
            <div id="tablaReportes"></div>
        </div>

        <div id="admin" class="tab-content">
            <h2>⚙️ Administración</h2>
            <button onclick="inicializarBD()">Inicializar Base de Datos</button>
            <div id="resAdmin" class="result" style="display:none;"></div>
        </div>
    </div>

    <script>
        let vinoActual = null;
        let todasLasVariedades = [];

        const zonaConfig = {
            'A1': 20, 'A2': 20, 'B1': 30, 'B2': 30,
            'C1': 30, 'C2': 30, 'D1': 20, 'D2': 20
        };

        function showTab(tab) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
        }

        function msg(id, text, error) {
            const el = document.getElementById(id);
            el.innerHTML = text;
            el.className = 'result ' + (error ? 'error' : '');
            el.style.display = 'block';
        }

        async function cargarDisponibilidad() {
            const data = await fetch('/api/disponibilidad').then(r => r.json()).catch(() => null);
            if (data && data.disponibles !== undefined) {
                document.getElementById('disponibilidadInfo').innerHTML = 'Disponibles: <strong>' + data.disponibles + '</strong> | Ocupados: <strong>' + data.ocupadas + '</strong> | Total: <strong>' + data.total + '</strong> (' + data.porcentajeOcupado + '%)';
            }
        }

        async function cargarDatos() {
            const paises = await fetch('/api/paises').then(r => r.json());
            const variedades = await fetch('/api/variedades').then(r => r.json());
            
            todasLasVariedades = variedades;
            
            document.getElementById('pais').innerHTML += paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            
            cargarDisponibilidad();
        }

        async function cargarRegiones() {
            const paisId = document.getElementById('pais').value;
            if (!paisId) return;
            const regiones = await fetch('/api/paises/' + paisId + '/regiones').then(r => r.json());
            document.getElementById('region').innerHTML = '<option value="">- Seleccionar Región -</option>' + regiones.map(r => '<option value="' + r.id + '">' + r.nombre + '</option>').join('');
        }

        async function cargarTiposVino() {
            const regionEl = document.getElementById('region');
            const regionName = regionEl.options[regionEl.selectedIndex].text;
            const tiposVino = await fetch('/api/tipos-vino').then(r => r.json());
            
            let opcionesHTML = '<option value="">- Seleccionar Tipo -</option>';
            
            tiposVino.forEach(t => {
                if (t.nombre === 'Champagne') {
                    if (regionName === 'Champagne') {
                        opcionesHTML += '<option value="' + t.id + '">' + t.nombre + '</option>';
                    }
                } else {
                    opcionesHTML += '<option value="' + t.id + '">' + t.nombre + '</option>';
                }
            });
            
            document.getElementById('tipoVino').innerHTML = opcionesHTML;
            
            mostrarVariedades();
        }

        function mostrarVariedades() {
            const container = document.getElementById('variedadesContainer');
            container.innerHTML = '';
            todasLasVariedades.forEach(v => {
                const div = document.createElement('div');
                div.innerHTML = '<input type="checkbox" id="var' + v.id + '" value="' + v.id + '"><label for="var' + v.id + '">' + v.nombre + '</label>';
                container.appendChild(div);
            });
        }

        function actualizarColumnasFilas() {
            const zona = document.getElementById('zona').value;
            const colSelect = document.getElementById('columna');
            const filaSelect = document.getElementById('fila');
            
            colSelect.innerHTML = '<option value="">- Seleccionar -</option>';
            filaSelect.innerHTML = '<option value="">- Seleccionar -</option>';
            document.getElementById('estadoUbicacion').innerHTML = '';
            
            if (!zona) return;
            
            const maxCols = zonaConfig[zona];
            for (let i = 1; i <= maxCols; i++) {
                colSelect.innerHTML += '<option value="' + i + '">Columna ' + i + '</option>';
            }
        }

        function actualizarFilas() {
            const filaSelect = document.getElementById('fila');
            filaSelect.innerHTML = '<option value="">- Seleccionar -</option>';
            
            for (let i = 1; i <= 20; i++) {
                filaSelect.innerHTML += '<option value="' + i + '">Fila ' + i + '</option>';
            }
            
            verificarDisponibilidad();
        }

        async function verificarDisponibilidad() {
            const zona = document.getElementById('zona').value;
            const columna = document.getElementById('columna').value;
            const fila = document.getElementById('fila').value;
            
            if (!zona || !columna || !fila) {
                document.getElementById('estadoUbicacion').innerHTML = '';
                return;
            }
            
            const disp = await fetch('/api/verificar-ubicacion?zona=' + zona + '&col=' + columna + '&fila=' + fila).then(r => r.json()).catch(() => null);
            
            if (disp) {
                if (disp.disponible) {
                    document.getElementById('estadoUbicacion').innerHTML = '<span style="color: #4CAF50;">✅ <strong>Disponible:</strong> ' + zona + ' (Col: ' + columna + ', Fila: ' + fila + ')</span>';
                } else {
                    document.getElementById('estadoUbicacion').innerHTML = '<span style="color: #ff9800;">❌ <strong>Ocupada:</strong> Esta posición ya tiene una botella</span>';
                }
            }
        }

        async function registrarEntrada() {
            const variedadesChecks = document.querySelectorAll('#variedadesContainer input[type="checkbox"]:checked');
            const variedades = Array.from(variedadesChecks).map(c => c.value);
            
            const datos = {
                nombre_vino: document.getElementById('nombreVino').value,
                tipo_vino_id: document.getElementById('tipoVino').value,
                pais_id: document.getElementById('pais').value,
                region_id: document.getElementById('region').value,
                bodega: document.getElementById('bodega').value,
                ano: document.getElementById('ano').value,
                notas: document.getElementById('notasEntrada').value,
                variedades: variedades,
                zona: document.getElementById('zona').value,
                columna: document.getElementById('columna').value,
                fila: document.getElementById('fila').value
            };

            if (!datos.nombre_vino || !datos.tipo_vino_id || !datos.pais_id || !datos.region_id || !datos.bodega || !datos.ano || !datos.zona || !datos.columna || !datos.fila || variedades.length === 0) {
                msg('resEntrada', 'Completa todos los campos obligatorios incluyendo variedades', true);
                return;
            }

            const res = await fetch('/api/vinos', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) }).then(r => r.json());
            
            if (res.success) {
                const v = res.vino;
                let html = '<strong style="color: #4CAF50;">✅ ' + res.message + '</strong><br>';
                html += '<div style="background: rgba(76,175,80,0.15); padding: 15px; margin: 10px 0; border-radius: 3px;">';
                html += '<strong>Vino:</strong> ' + v.nombre_vino + '<br>';
                html += '<strong>Bodega:</strong> ' + datos.bodega + '<br>';
                html += '<strong>Año:</strong> ' + datos.ano + '<br>';
                html += '<strong style="color: #D4AF37;">📍 UBICACIÓN:</strong><br>';
                html += '<strong>Zona:</strong> ' + v.ubicacion.zona + '<br>';
                html += '<strong>Posición:</strong> Columna ' + v.ubicacion.columna + ', Fila ' + v.ubicacion.fila + '<br>';
                html += '<strong>Referencia:</strong> <code style="background: #333; padding: 3px;">' + v.ubicacion.referencia + '</code><br><br>';
                html += '<strong>Código QR:</strong> <code style="background: #333; padding: 3px; font-size: 0.9em;">' + v.codigo_qr + '</code>';
                html += '</div>';
                msg('resEntrada', html);
                
                document.getElementById('formEntrada').querySelectorAll('input[type="text"], input[type="number"], select, textarea').forEach(e => e.value = '');
                document.getElementById('nombreVino').value = '';
                document.getElementById('bodega').value = '';
                document.getElementById('ano').value = '';
                document.getElementById('zona').value = '';
                actualizarColumnasFilas();
                mostrarVariedades();
                cargarDisponibilidad();
            } else {
                msg('resEntrada', res.error, true);
            }
        }

        function cambiarMovimiento() {
            const tipo = document.getElementById('tipoMov').value;
            document.getElementById('formEntrada').style.display = tipo === 'Entrada' ? 'block' : 'none';
            document.getElementById('formMov').style.display = tipo && tipo !== 'Entrada' ? 'block' : 'none';
            if (tipo && tipo !== 'Entrada') {
                document.getElementById('titMov').textContent = tipo;
                document.getElementById('codigoQR').value = '';
                document.getElementById('infoVino').style.display = 'none';
                vinoActual = null;
            }
            if (tipo === 'Entrada') cargarDisponibilidad();
        }

        async function buscarVino() {
            const codigo = document.getElementById('codigoQR').value.trim();
            if (!codigo) { msg('resMov', 'Ingresa código', true); return; }
            const vino = await fetch('/api/vinos/qr/' + codigo).then(r => r.json());
            if (vino.error) {
                msg('resMov', vino.error, true);
                document.getElementById('infoVino').style.display = 'none';
            } else {
                vinoActual = vino;
                const ub = vino.zona_nombre ? '<strong>' + vino.zona_nombre + '</strong> (Col: ' + vino.columna + ', Fila: ' + vino.fila + ')' : '-';
                document.getElementById('infoVino').innerHTML = vino.nombre_vino + ' - ' + vino.bodega + ' (' + vino.ano + ') - Ubicación: ' + ub;
                document.getElementById('infoVino').style.display = 'block';
            }
        }

        async function registrarMovimiento() {
            if (!vinoActual) { msg('resMov', 'Busca un vino primero', true); return; }
            const res = await fetch('/api/vinos/' + vinoActual.id + '/movimiento', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tipo_movimiento: document.getElementById('tipoMov').value, razon: document.getElementById('razonMov').value, notas: document.getElementById('notasMov').value })
            }).then(r => r.json());
            if (res.success) {
                msg('resMov', res.message);
                document.getElementById('codigoQR').value = '';
                document.getElementById('infoVino').style.display = 'none';
                vinoActual = null;
            } else {
                msg('resMov', res.error, true);
            }
        }

        async function cargarHistorial() {
            const movs = await fetch('/api/movimientos').then(r => r.json());
            let html = '<table><tr><th>Fecha</th><th>Vino</th><th>Movimiento</th></tr>';
            movs.forEach(m => {
                const fecha = new Date(m.fecha_movimiento).toLocaleString();
                html += '<tr><td>' + fecha + '</td><td>' + (m.nombre_vino || m.bodega) + '</td><td>' + m.tipo_movimiento + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('historial').innerHTML = html;
        }

        async function cargarInventario() {
            const vinos = await fetch('/api/vinos').then(r => r.json());
            let html = '<table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th></tr>';
            vinos.forEach(v => {
                const ub = v.zona_nombre ? '<strong>' + v.zona_nombre + '</strong> (' + v.columna + ',' + v.fila + ')' : '-';
                html += '<tr><td>' + (v.nombre_vino || 'N/A') + '</td><td>' + v.bodega + '</td><td>' + v.ano + '</td><td>' + (v.tipo_nombre || '-') + '</td><td>' + ub + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('tablaInventario').innerHTML = html;
        }

        async function buscarQR() {
            const codigo = document.getElementById('codigoQRScan').value.trim();
            if (!codigo) return;
            const vino = await fetch('/api/vinos/qr/' + codigo).then(r => r.json());
            if (vino.error) {
                msg('resScanner', vino.error, true);
            } else {
                const ub = vino.zona_nombre ? '<strong>' + vino.zona_nombre + '</strong> (' + vino.columna + ',' + vino.fila + ')' : '-';
                msg('resScanner', vino.nombre_vino + ' - ' + vino.bodega + ' (' + vino.ano + ')<br>Ubicación: ' + ub);
            }
        }

        async function cargarReportes() {
            const data = await fetch('/api/reportes/resumen').then(r => r.json());
            let html = '<p><strong>Total Botellas:</strong> ' + data.total_botellas + '</p>';
            if (data.por_tipo && data.por_tipo.length > 0) {
                html += '<table><tr><th>Tipo</th><th>Cantidad</th></tr>';
                data.por_tipo.forEach(t => html += '<tr><td>' + t.nombre + '</td><td>' + t.total + '</td></tr>');
                html += '</table>';
            }
            document.getElementById('tablaReportes').innerHTML = html;
        }

        async function inicializarBD() {
            const res = await fetch('/setup').then(r => r.json());
            if (res.success) {
                msg('resAdmin', res.message);
                setTimeout(() => location.reload(), 2000);
            } else {
                msg('resAdmin', res.error, true);
            }
        }

        window.onload = cargarDatos;
    </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(html));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
