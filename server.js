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
        await pool.query('DROP TABLE IF EXISTS vino_variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_vino CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, codigo_iso VARCHAR(2))');
        await pool.query('CREATE TABLE regiones (id SERIAL PRIMARY KEY, pais_id INTEGER REFERENCES paises(id) ON DELETE CASCADE, nombre VARCHAR(100), UNIQUE(pais_id, nombre))');
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, descripcion TEXT)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(5) NOT NULL UNIQUE, columnas INTEGER, filas INTEGER)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE, columna INTEGER, fila INTEGER, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))');
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150), ano INTEGER, ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL, estado VARCHAR(20) DEFAULT \'Disponible\', fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)');
        await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, variedad_id INTEGER REFERENCES variedades(id) ON DELETE CASCADE, UNIQUE(vino_id, variedad_id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(50), razon TEXT, notas TEXT, fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

        await pool.query('INSERT INTO tipos_vino (nombre) VALUES (\'Tinto\'), (\'Blanco\'), (\'Rosado\'), (\'Espumante\'), (\'Champagne\')');
        
        const variedades = ['Chardonnay', 'Pinot Noir', 'Merlot', 'Cabernet Sauvignon', 'Syrah', 'Grenache', 'Riesling', 'Sauvignon Blanc', 'Pinot Grigio', 'Tempranillo', 'Albariño', 'Prosecco', 'Moscato', 'Babić', 'Plavac Mali', 'Malvasia', 'Vermentino', 'Nero d\'Avola', 'Sangiovese', 'Barbera', 'Nebbiolo', 'Vinhão', 'Baga', 'Garnacha', 'Mencía', 'Zweigelt', 'Grüner Veltliner', 'Müller-Thurgau', 'Dornfelder', 'Trollinger', 'Touriga Nacional', 'Aragonez', 'Tinta Barroca', 'Tinta Roriz', 'Fernão Pires', 'Malbec', 'Bonarda', 'Torrontés', 'Cabernet Franc', 'Tannat', 'Carmenère', 'Shiraz', 'Sémillon', 'Pinotage', 'Chenin Blanc', 'Colombard'];
        for (const v of variedades) {
            await pool.query('INSERT INTO variedades (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [v]);
        }
        
        const paises_data = [['Francia', 'FR'], ['Italia', 'IT'], ['España', 'ES'], ['Austria', 'AT'], ['Alemania', 'DE'], ['Portugal', 'PT'], ['Argentina', 'AR'], ['Chile', 'CL'], ['Australia', 'AU'], ['Nueva Zelanda', 'NZ'], ['Estados Unidos', 'US'], ['Croacia', 'HR'], ['Hungría', 'HU'], ['Rumania', 'RO'], ['Sudáfrica', 'ZA']];
        for (const [nombre, codigo] of paises_data) {
            await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2) ON CONFLICT DO NOTHING', [nombre, codigo]);
        }
        
        const regiones_data = [
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
            { pais: 'Estados Unidos', regs: ['Napa Valley', 'Sonoma', 'Oregon', 'Washington'] },
            { pais: 'Croacia', regs: ['Dalmacia', 'Continentalía', 'Istria'] },
            { pais: 'Hungría', regs: ['Tokaj', 'Eger', 'Villány'] },
            { pais: 'Rumania', regs: ['Prut y Danubio', 'Arcadía', 'Vosges'] },
            { pais: 'Sudáfrica', regs: ['Stellenbosch', 'Paarl', 'Franschhoek', 'Walker Bay'] }
        ];
        
        for (const r of regiones_data) {
            const paisRes = await pool.query('SELECT id FROM paises WHERE nombre = $1', [r.pais]);
            if (paisRes.rows.length > 0) {
                for (const reg of r.regs) {
                    await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING', [paisRes.rows[0].id, reg]);
                }
            }
        }
        
        await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES (\'A1\', 20, 20), (\'A2\', 20, 20), (\'B1\', 30, 20), (\'B2\', 30, 20), (\'C1\', 30, 20), (\'C2\', 30, 20), (\'D1\', 20, 20), (\'D2\', 20, 20) ON CONFLICT DO NOTHING');

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

app.post('/api/agregar-pais', async (req, res) => {
    try {
        const { nombre, codigo_iso } = req.body;
        if (!nombre || !codigo_iso) return res.json({ error: 'Nombre y código ISO requeridos' });
        const result = await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2) RETURNING *', [nombre, codigo_iso]);
        res.json({ success: true, pais: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'El país ya existe' : err.message });
    }
});

app.post('/api/agregar-variedad', async (req, res) => {
    try {
        const { nombre, descripcion } = req.body;
        if (!nombre) return res.json({ error: 'Nombre requerido' });
        const result = await pool.query('INSERT INTO variedades (nombre, descripcion) VALUES ($1, $2) RETURNING *', [nombre, descripcion || '']);
        res.json({ success: true, variedad: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'La variedad ya existe' : err.message });
    }
});

app.post('/api/agregar-region', async (req, res) => {
    try {
        const { pais_id, nombre } = req.body;
        if (!pais_id || !nombre) return res.json({ error: 'País y nombre de región requeridos' });
        const result = await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) RETURNING *', [pais_id, nombre]);
        res.json({ success: true, region: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'La región ya existe' : err.message });
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

app.get('/api/ubicaciones-ocupadas', async (req, res) => {
    try {
        const result = await pool.query('SELECT z.nombre as zona, u.columna, u.fila FROM ubicaciones u JOIN zonas z ON u.zona_id = z.id WHERE u.disponible = false');
        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/buscar-vinos', async (req, res) => {
    try {
        const { nombre, tipo, bodega, ano, variedad } = req.query;
        let query = 'SELECT DISTINCT v.*, tv.nombre as tipo_nombre, p.nombre as pais_nombre, r.nombre as region_nombre, z.nombre as zona_nombre, u.columna, u.fila FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN paises p ON v.pais_id = p.id LEFT JOIN regiones r ON v.region_id = r.id LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id LEFT JOIN zonas z ON u.zona_id = z.id LEFT JOIN vino_variedades vv ON v.id = vv.vino_id LEFT JOIN variedades var ON vv.variedad_id = var.id WHERE 1=1';
        const params = [];
        
        if (nombre) {
            params.push('%' + nombre + '%');
            query += ' AND (v.nombre_vino ILIKE $' + params.length + ' OR v.bodega ILIKE $' + params.length + ')';
        }
        if (tipo) {
            params.push(parseInt(tipo));
            query += ' AND v.tipo_vino_id = $' + params.length;
        }
        if (bodega) {
            params.push('%' + bodega + '%');
            query += ' AND v.bodega ILIKE $' + params.length;
        }
        if (ano) {
            params.push(parseInt(ano));
            query += ' AND v.ano = $' + params.length;
        }
        if (variedad) {
            params.push(parseInt(variedad));
            query += ' AND var.id = $' + params.length;
        }
        
        query += ' ORDER BY v.fecha_ingreso DESC LIMIT 200';
        const result = await pool.query(query, params);
        res.json(result.rows);
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

app.post('/api/vinos-lote', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tipo_vino_id, pais_id, region_id, nombre_vino, bodega, ano, variedades, notas, ubicaciones } = req.body;
        if (!tipo_vino_id || !pais_id || !region_id || !nombre_vino || !bodega || !ano || !variedades || variedades.length === 0 || !ubicaciones || ubicaciones.length === 0) {
            return res.json({ error: 'Faltan datos requeridos' });
        }

        await client.query('BEGIN');
        const vinos_registrados = [];
        
        for (const ub_data of ubicaciones) {
            const { zona, columna, fila } = ub_data;
            
            const zonaResult = await client.query('SELECT id FROM zonas WHERE nombre = $1', [zona]);
            if (zonaResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ error: 'Zona ' + zona + ' no existe' });
            }
            const zona_id = zonaResult.rows[0].id;
            
            const ubResult = await client.query('SELECT id, disponible FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 LIMIT 1 FOR UPDATE', [zona_id, parseInt(columna), parseInt(fila)]);
            if (ubResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ error: 'Ubicación ' + zona + '-' + columna + '-' + fila + ' no existe' });
            }
            if (!ubResult.rows[0].disponible) {
                await client.query('ROLLBACK');
                return res.json({ error: 'Ubicación ' + zona + '-' + columna + '-' + fila + ' ya está ocupada' });
            }
            
            const ub_id = ubResult.rows[0].id;
            const codigo_qr = crypto.randomBytes(16).toString('hex');
            const result = await client.query('INSERT INTO vinos (codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id, notas) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *', [codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ub_id, notas]);
            const vino_id = result.rows[0].id;
            
            for (const var_id of variedades) {
                await client.query('INSERT INTO vino_variedades (vino_id, variedad_id) VALUES ($1, $2)', [vino_id, parseInt(var_id)]);
            }
            
            await client.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ub_id]);
            await client.query('INSERT INTO movimientos (vino_id, tipo_movimiento, razon) VALUES ($1, $2, $3)', [vino_id, 'Entrada', 'Registro inicial']);
            
            vinos_registrados.push({
                id: vino_id,
                codigo_qr: codigo_qr,
                ubicacion: { zona: zona, columna: columna, fila: fila, referencia: zona + '-' + columna + '-' + fila }
            });
        }
        
        await client.query('COMMIT');
        res.json({ success: true, message: vinos_registrados.length + ' botella(s) registrada(s)', vinos: vinos_registrados });
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
        res.json({ total_botellas: total.rows[0].total, por_tipo: por_tipo.rows });
    } catch (err) {
        res.json({ error: err.message });
    }
});

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
        table { width: 100%; margin-top: 15px; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #444; }
        th { background: rgba(212,175,55,0.2); color: #D4AF37; }
        .checkbox-group { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0; }
        .checkbox-group label { margin: 0; display: flex; align-items: center; color: #fff; }
        .checkbox-group input[type="checkbox"] { margin-right: 10px; width: auto; }
        .form-section { background: rgba(0,0,0,0.2); padding: 15px; margin: 15px 0; border-radius: 3px; }
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
            <button class="tab-btn" onclick="showTab('datos')">➕ Datos</button>
            <button class="tab-btn" onclick="showTab('admin')">⚙️ Admin</button>
        </div>

        <div id="movimientos" class="tab-content active">
            <h2>🔄 Movimientos de Vino</h2>
            
            <div class="form-section">
                <h3>🔍 BUSCAR VINOS</h3>
                <label>Nombre o Bodega</label>
                <input id="searchNombre" type="text" placeholder="Ej: Veuve, Babić">
                
                <label>Tipo de Vino</label>
                <select id="searchTipo"></select>
                
                <label>Variedad de Uva</label>
                <select id="searchVariedad"></select>
                
                <label>Año</label>
                <input id="searchAno" type="number" placeholder="2020">
                
                <label>Bodega</label>
                <input id="searchBodega" type="text" placeholder="Ej: Château Lafite">
                
                <button onclick="buscar()">🔍 BUSCAR</button>
                <div id="searchResults" style="display:none; margin-top:20px;"></div>
            </div>

            <hr>
            <h3>TIPO DE MOVIMIENTO</h3>
            <select id="tipoMov" onchange="cambiarMov()">
                <option value="">- Seleccionar -</option>
                <option value="entrada">📥 Entrada</option>
                <option value="consumo">🍷 Consumo</option>
                <option value="venta">💰 Venta</option>
                <option value="dano">⚠️ Daño</option>
                <option value="perdida">❌ Pérdida</option>
            </select>

            <div id="formEntrada" style="display:none; margin-top:20px;">
                <h3>📥 Registrar Nueva(s) Botella(s)</h3>
                <div class="info-box" id="capacidad">Cargando...</div>
                <label>Nombre del Vino</label>
                <input id="entNombre" type="text">
                <label>Bodega</label>
                <input id="entBodega" type="text">
                <label>Año</label>
                <input id="entAno" type="number">
                <label>País</label>
                <select id="entPais" onchange="cargarRegs()"></select>
                <label>Región</label>
                <select id="entRegion" onchange="cargarTipos()"></select>
                <label>Tipo</label>
                <select id="entTipo"></select>
                <label>Variedades (selecciona una o más)</label>
                <div id="variedadList" class="checkbox-group"></div>
                <label>Cantidad</label>
                <input id="cantidad" type="number" value="1" onchange="actualizarUbicaciones()">
                <div id="ubicacionesList"></div>
                <button onclick="registrar()">REGISTRAR</button>
                <div id="entResult" style="display:none; margin-top:15px;"></div>
            </div>

            <div id="formMov" style="display:none; margin-top:20px;">
                <h3 id="titMov"></h3>
                <label>Código QR</label>
                <input id="qrCode" type="text">
                <button onclick="buscarPorQR()">Buscar</button>
                <div id="vinoInfo" style="display:none; padding:10px; background:#0a3a0a; margin:10px 0; border-radius:3px;"></div>
                <label>Razón</label>
                <textarea id="movRazon" rows="3"></textarea>
                <label>Notas</label>
                <textarea id="movNotas" rows="2"></textarea>
                <button onclick="registrarMov()">REGISTRAR</button>
                <div id="movResult" style="display:none; margin-top:15px;"></div>
            </div>
        </div>

        <div id="inventario" class="tab-content">
            <h2>📚 Inventario</h2>
            <button onclick="cargarInventario()">CARGAR</button>
            <div id="invTable" style="margin-top:20px;"></div>
        </div>

        <div id="scanner" class="tab-content">
            <h2>📱 Scanner QR</h2>
            <input id="scanInput" type="text" autofocus placeholder="Escanea QR aquí">
            <button onclick="scanSearch()">BUSCAR</button>
            <div id="scanResult" style="display:none; margin-top:20px;"></div>
        </div>

        <div id="reportes" class="tab-content">
            <h2>📊 Reportes</h2>
            <button onclick="cargarReportes()">CARGAR</button>
            <div id="repTable" style="margin-top:20px;"></div>
        </div>

        <div id="datos" class="tab-content">
            <h2>➕ Datos Maestros</h2>
            <div class="form-section">
                <h3>Agregar País</h3>
                <input id="newPais" type="text" placeholder="Nombre">
                <input id="newCodia" type="text" maxlength="2" placeholder="Código ISO">
                <button onclick="addPais()">Agregar</button>
                <div id="paisMsg" style="display:none; margin-top:10px;"></div>
            </div>
            <div class="form-section">
                <h3>Agregar Variedad</h3>
                <input id="newVar" type="text" placeholder="Nombre">
                <input id="newVarDesc" type="text" placeholder="Descripción">
                <button onclick="addVar()">Agregar</button>
                <div id="varMsg" style="display:none; margin-top:10px;"></div>
            </div>
            <div class="form-section">
                <h3>Agregar Región</h3>
                <select id="newRegPais"></select>
                <input id="newRegNombre" type="text" placeholder="Nombre">
                <button onclick="addReg()">Agregar</button>
                <div id="regMsg" style="display:none; margin-top:10px;"></div>
            </div>
        </div>

        <div id="admin" class="tab-content">
            <h2>⚙️ Admin</h2>
            <button onclick="initDB()">INICIALIZAR BD</button>
            <div id="adminMsg" style="display:none; margin-top:20px;"></div>
        </div>
    </div>

    <script>
        let vinoActual = null;
        let allTipos = [];
        let allVars = [];
        let ubicadas = [];

        const zones = { A1:20, A2:20, B1:30, B2:30, C1:30, C2:30, D1:20, D2:20 };
        let ubIndex = [];

        function showTab(t) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
            document.getElementById(t).classList.add('active');
            event.target.classList.add('active');
        }

        async function init() {
            const paises = await fetch('/api/paises').then(r => r.json());
            const tipos = await fetch('/api/tipos-vino').then(r => r.json());
            const vars = await fetch('/api/variedades').then(r => r.json());
            const ocupadas = await fetch('/api/ubicaciones-ocupadas').then(r => r.json());

            allTipos = tipos;
            allVars = vars;
            ubicadas = ocupadas;

            document.getElementById('entPais').innerHTML += paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            document.getElementById('newRegPais').innerHTML = paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');

            // BUSCAR
            document.getElementById('searchTipo').innerHTML = '<option value="">-Todos-</option>' + tipos.map(t => '<option value="' + t.id + '">' + t.nombre + '</option>').join('');
            document.getElementById('searchVariedad').innerHTML = '<option value="">-Todas-</option>' + vars.map(v => '<option value="' + v.id + '">' + v.nombre + '</option>').join('');

            cargarCap();
        }

        async function cargarCap() {
            const d = await fetch('/api/disponibilidad').then(r => r.json());
            document.getElementById('capacidad').innerHTML = 'Disponibles: ' + d.disponibles + ' | Ocupadas: ' + d.ocupadas + ' | Total: ' + d.total + ' (' + d.porcentajeOcupado + '%)';
        }

        async function cargarRegs() {
            const pid = document.getElementById('entPais').value;
            if (!pid) return;
            const regs = await fetch('/api/paises/' + pid + '/regiones').then(r => r.json());
            document.getElementById('entRegion').innerHTML = '<option value="">-Región-</option>' + regs.map(r => '<option value="' + r.id + '">' + r.nombre + '</option>').join('');
        }

        async function cargarTipos() {
            const regEl = document.getElementById('entRegion');
            const regName = regEl.options[regEl.selectedIndex].text;
            let html = '<option value="">-Tipo-</option>';
            allTipos.forEach(t => {
                if (t.nombre === 'Champagne' && regName !== 'Champagne') return;
                html += '<option value="' + t.id + '">' + t.nombre + '</option>';
            });
            document.getElementById('entTipo').innerHTML = html;
            mostrarVars();
        }

        function mostrarVars() {
            const html = allVars.map((v, i) => '<label><input type="checkbox" value="' + v.id + '">' + v.nombre + '</label>').join('');
            document.getElementById('variedadList').innerHTML = html;
        }

        function actualizarUbicaciones() {
            const cant = parseInt(document.getElementById('cantidad').value) || 1;
            let html = '';
            ubIndex = [];
            for (let i = 0; i < cant; i++) {
                html += '<div style="background:rgba(0,0,0,0.3); padding:15px; margin:10px 0; border-radius:3px;">';
                html += '<strong>Botella ' + (i+1) + '</strong><br>';
                html += '<label>Zona</label>';
                html += '<select onchange="updCols(' + i + ')" id="z' + i + '">';
                html += '<option>-Zona-</option>';
                Object.keys(zones).forEach(z => html += '<option value="' + z + '">' + z + '</option>');
                html += '</select>';
                html += '<label>Columna</label>';
                html += '<select onchange="updFils(' + i + ')" id="c' + i + '"><option>-Col-</option></select>';
                html += '<label>Fila</label>';
                html += '<select onchange="checkUb(' + i + ')" id="f' + i + '"><option>-Fila-</option></select>';
                html += '<div id="st' + i + '" style="margin-top:10px;"></div>';
                html += '</div>';
                ubIndex[i] = {};
            }
            document.getElementById('ubicacionesList').innerHTML = html;
        }

        function updCols(i) {
            const z = document.getElementById('z' + i).value;
            const c = document.getElementById('c' + i);
            c.innerHTML = '<option>-Col-</option>';
            if (!z) return;
            const max = zones[z];
            for (let x = 1; x <= max; x++) c.innerHTML += '<option value="' + x + '">Col ' + x + '</option>';
            ubIndex[i].zona = z;
        }

        function updFils(i) {
            const f = document.getElementById('f' + i);
            f.innerHTML = '<option>-Fila-</option>';
            for (let y = 1; y <= 20; y++) f.innerHTML += '<option value="' + y + '">Fila ' + y + '</option>';
            const c = document.getElementById('c' + i).value;
            ubIndex[i].columna = c;
        }

        function checkUb(i) {
            const z = ubIndex[i].zona;
            const c = ubIndex[i].columna;
            const f = document.getElementById('f' + i).value;
            ubIndex[i].fila = f;

            const ocupada = ubicadas.some(u => u.zona === z && u.columna == c && u.fila == f);
            const st = document.getElementById('st' + i);
            if (ocupada) {
                st.innerHTML = '<span style="color:#f44336;">❌ OCUPADA</span>';
                document.getElementById('f' + i).style.borderColor = '#f44336';
            } else {
                st.innerHTML = '<span style="color:#4CAF50;">✅ Disponible</span>';
                document.getElementById('f' + i).style.borderColor = '#4CAF50';
            }
        }

        async function buscar() {
            const n = document.getElementById('searchNombre').value;
            const t = document.getElementById('searchTipo').value;
            const v = document.getElementById('searchVariedad').value;
            const a = document.getElementById('searchAno').value;
            const b = document.getElementById('searchBodega').value;

            let url = '/api/buscar-vinos?';
            if (n) url += 'nombre=' + encodeURIComponent(n) + '&';
            if (t) url += 'tipo=' + t + '&';
            if (v) url += 'variedad=' + v + '&';
            if (a) url += 'ano=' + a + '&';
            if (b) url += 'bodega=' + encodeURIComponent(b) + '&';

            const res = await fetch(url).then(r => r.json());
            const el = document.getElementById('searchResults');
            
            if (!res || res.length === 0) {
                el.innerHTML = '<strong style="color:#f44336;">NO ENCONTRADO</strong>';
            } else {
                let html = '<strong style="color:#4CAF50;">Encontrados: ' + res.length + '</strong><table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th><th>QR</th></tr>';
                res.forEach(r => {
                    const ub = r.zona_nombre ? r.zona_nombre + '(' + r.columna + ',' + r.fila + ')' : 'N/A';
                    html += '<tr><td>' + (r.nombre_vino || '-') + '</td><td>' + r.bodega + '</td><td>' + r.ano + '</td><td>' + (r.tipo_nombre || '-') + '</td><td>' + ub + '</td><td><button onclick="copyQR(\'' + r.codigo_qr + '\')">Copiar</button></td></tr>';
                });
                html += '</table>';
                el.innerHTML = html;
            }
            el.style.display = 'block';
        }

        function copyQR(code) {
            navigator.clipboard.writeText(code).then(() => alert('QR copiado: ' + code));
        }

        function cambiarMov() {
            const t = document.getElementById('tipoMov').value;
            document.getElementById('formEntrada').style.display = t === 'entrada' ? 'block' : 'none';
            document.getElementById('formMov').style.display = (t && t !== 'entrada') ? 'block' : 'none';
            if (t && t !== 'entrada') {
                document.getElementById('titMov').textContent = t.toUpperCase();
                document.getElementById('qrCode').value = '';
                document.getElementById('vinoInfo').style.display = 'none';
                vinoActual = null;
            }
            if (t === 'entrada') {
                cargarCap();
                actualizarUbicaciones();
            }
        }

        async function registrar() {
            const vars = Array.from(document.querySelectorAll('#variedadList input:checked')).map(c => c.value);
            const ubs = ubIndex.filter(u => u.zona && u.columna && u.fila);

            if (!document.getElementById('entNombre').value || !document.getElementById('entTipo').value || !document.getElementById('entPais').value || !document.getElementById('entRegion').value || !document.getElementById('entBodega').value || !document.getElementById('entAno').value || vars.length === 0 || ubs.length === 0) {
                alert('Completa TODO');
                return;
            }

            const dat = {
                nombre_vino: document.getElementById('entNombre').value,
                tipo_vino_id: document.getElementById('entTipo').value,
                pais_id: document.getElementById('entPais').value,
                region_id: document.getElementById('entRegion').value,
                bodega: document.getElementById('entBodega').value,
                ano: document.getElementById('entAno').value,
                variedades: vars,
                ubicaciones: ubs,
                notas: document.getElementById('entNombre').value
            };

            const res = await fetch('/api/vinos-lote', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(dat) }).then(r => r.json());
            const el = document.getElementById('entResult');
            if (res.success) {
                let html = '<strong style="color:#4CAF50;">✅ ' + res.message + '</strong><br>';
                res.vinos.forEach(v => html += '<div style="background:rgba(76,175,80,0.15); padding:10px; margin:10px 0; border-radius:3px;"><strong>' + v.ubicacion.referencia + '</strong><br><code>' + v.codigo_qr + '</code></div>');
                el.innerHTML = html;
                document.getElementById('entNombre').value = '';
                document.getElementById('entBodega').value = '';
                document.getElementById('entAno').value = '';
                document.getElementById('cantidad').value = '1';
                actualizarUbicaciones();
                cargarCap();
            } else {
                el.innerHTML = '<strong style="color:#f44336;">' + res.error + '</strong>';
            }
            el.style.display = 'block';
        }

        async function buscarPorQR() {
            const code = document.getElementById('qrCode').value.trim();
            if (!code) return alert('Ingresa QR');
            const res = await fetch('/api/vinos/qr/' + code).then(r => r.json());
            const el = document.getElementById('vinoInfo');
            if (res.error) {
                el.innerHTML = '<strong style="color:#f44336;">NO ENCONTRADO</strong>';
            } else {
                vinoActual = res;
                const ub = res.zona_nombre ? '<strong>' + res.zona_nombre + '</strong> (' + res.columna + ',' + res.fila + ')' : 'N/A';
                el.innerHTML = res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ') - ' + ub;
            }
            el.style.display = 'block';
        }

        async function registrarMov() {
            if (!vinoActual) return alert('Busca primero');
            const t = document.getElementById('tipoMov').value;
            const tipoMap = { consumo: 'Consumo', venta: 'Venta', dano: 'Daño', perdida: 'Pérdida' };
            const res = await fetch('/api/vinos/' + vinoActual.id + '/movimiento', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tipo_movimiento: tipoMap[t], razon: document.getElementById('movRazon').value, notas: document.getElementById('movNotas').value })
            }).then(r => r.json());
            const el = document.getElementById('movResult');
            el.innerHTML = '<strong style="color:' + (res.success ? '#4CAF50' : '#f44336') + ';">' + (res.success ? '✅' : '❌') + ' ' + (res.message || res.error) + '</strong>';
            el.style.display = 'block';
        }

        async function cargarInventario() {
            const res = await fetch('/api/vinos').then(r => r.json());
            let html = '<table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th></tr>';
            res.forEach(v => {
                const ub = v.zona_nombre ? v.zona_nombre + '(' + v.columna + ',' + v.fila + ')' : 'N/A';
                html += '<tr><td>' + (v.nombre_vino || '-') + '</td><td>' + v.bodega + '</td><td>' + v.ano + '</td><td>' + (v.tipo_nombre || '-') + '</td><td>' + ub + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('invTable').innerHTML = html;
        }

        async function scanSearch() {
            const code = document.getElementById('scanInput').value.trim();
            if (!code) return;
            const res = await fetch('/api/vinos/qr/' + code).then(r => r.json());
            const el = document.getElementById('scanResult');
            if (res.error) {
                el.innerHTML = '<strong style="color:#f44336;">NO ENCONTRADO</strong>';
            } else {
                const ub = res.zona_nombre ? res.zona_nombre + '(' + res.columna + ',' + res.fila + ')' : 'N/A';
                el.innerHTML = res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ') - ' + ub;
            }
            el.style.display = 'block';
        }

        async function cargarReportes() {
            const res = await fetch('/api/reportes/resumen').then(r => r.json());
            let html = '<p><strong>Total:</strong> ' + res.total_botellas + '</p><table><tr><th>Tipo</th><th>Cantidad</th></tr>';
            res.por_tipo.forEach(t => html += '<tr><td>' + t.nombre + '</td><td>' + t.total + '</td></tr>');
            html += '</table>';
            document.getElementById('repTable').innerHTML = html;
        }

        async function addPais() {
            const n = document.getElementById('newPais').value;
            const c = document.getElementById('newCodia').value;
            const res = await fetch('/api/agregar-pais', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nombre: n, codigo_iso: c }) }).then(r => r.json());
            const el = document.getElementById('paisMsg');
            el.innerHTML = '<strong style="color:' + (res.success ? '#4CAF50' : '#f44336') + ';">' + (res.success ? '✅ ' + res.message : '❌ ' + res.error) + '</strong>';
            el.style.display = 'block';
        }

        async function addVar() {
            const n = document.getElementById('newVar').value;
            const d = document.getElementById('newVarDesc').value;
            const res = await fetch('/api/agregar-variedad', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nombre: n, descripcion: d }) }).then(r => r.json());
            const el = document.getElementById('varMsg');
            el.innerHTML = '<strong style="color:' + (res.success ? '#4CAF50' : '#f44336') + ';">' + (res.success ? '✅ Agregada' : '❌ ' + res.error) + '</strong>';
            el.style.display = 'block';
        }

        async function addReg() {
            const pid = document.getElementById('newRegPais').value;
            const n = document.getElementById('newRegNombre').value;
            const res = await fetch('/api/agregar-region', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ pais_id: pid, nombre: n }) }).then(r => r.json());
            const el = document.getElementById('regMsg');
            el.innerHTML = '<strong style="color:' + (res.success ? '#4CAF50' : '#f44336') + ';">' + (res.success ? '✅ Agregada' : '❌ ' + res.error) + '</strong>';
            el.style.display = 'block';
        }

        async function initDB() {
            const res = await fetch('/setup').then(r => r.json());
            const el = document.getElementById('adminMsg');
            el.innerHTML = '<strong style="color:' + (res.success ? '#4CAF50' : '#f44336') + ';">' + (res.success ? '✅ ' + res.message : '❌ ' + res.error) + '</strong>';
            el.style.display = 'block';
            setTimeout(() => location.reload(), 2000);
        }

        window.onload = init;
    </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(html));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
