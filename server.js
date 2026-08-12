const express = require('express');
const cors = require('cors');
const pg = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.get('/setup', async (req, res) => {
    try {
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_movimiento CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE regiones (id SERIAL PRIMARY KEY, pais_id INT REFERENCES paises(id), nombre VARCHAR(100))');
        await pool.query('CREATE TABLE tipos (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE tipos_movimiento (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) UNIQUE)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INT REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
        await pool.query(`CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(100) UNIQUE, nombre VARCHAR(200), tipo_id INT REFERENCES tipos(id), pais_id INT REFERENCES paises(id), region_id INT REFERENCES regiones(id), bodega VARCHAR(100), ano INT, ubicacion_id INT REFERENCES ubicaciones(id), cantidad INT DEFAULT 1, estado VARCHAR(50) DEFAULT 'activa')`);
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INT REFERENCES vinos(id), tipo_movimiento_id INT REFERENCES tipos_movimiento(id), fecha TIMESTAMP DEFAULT NOW())');
        
        const paises = ['Francia', 'Italia', 'España', 'Portugal', 'Alemania', 'Austria', 'Suiza', 'Croacia', 'Argentina', 'Chile', 'Australia', 'Nueva Zelanda', 'USA', 'Canadá', 'Sudáfrica', 'Brasil', 'Grecia', 'Hungría', 'República Checa', 'Rumania', 'Perú'];
        for (const pais of paises) {
            await pool.query('INSERT INTO paises (nombre) VALUES ($1)', [pais]);
        }
        
        const regionesPorPais = {
            'Francia': ['Burdeos', 'Borgoña', 'Alsacia', 'Champagne', 'Provenza', 'Ródano', 'Loire', 'Jura'],
            'Italia': ['Toscana', 'Piamonte', 'Véneto', 'Sicilia', 'Umbría', 'Campania', 'Emilia-Romaña', 'Friuli-Venecia Julia'],
            'España': ['La Rioja', 'Ribera del Duero', 'Cataluña', 'Andalucía', 'Castilla-La Mancha', 'Navarra', 'Penedès', 'Priorat'],
            'Portugal': ['Douro', 'Minho', 'Bairrada', 'Estremadura', 'Alentejo', 'Algarve', 'Dao', 'Colares'],
            'Alemania': ['Mosel', 'Rin', 'Württemberg', 'Baden', 'Alsacia-Lorena', 'Frankenland', 'Mittelrhein', 'Ahr'],
            'Austria': ['Wachau', 'Danubio', 'Estiria', 'Burgenland', 'Viena', 'Baja Austria', 'Weinviertel', 'Kamptal'],
            'Suiza': ['Valais', 'Vaud', 'Ginebra', 'Neuchâtel', 'Ticino', 'Jura', 'Lucerna', 'Basilea'],
            'Croacia': ['Istria', 'Dalmacia', 'Kvarner', 'Llanura Panónica', 'Eslavonia', 'Baja Croacia', 'Primorski', 'Kontinentalna'],
            'Argentina': ['Mendoza', 'Salta', 'La Rioja', 'San Juan', 'Misiones', 'Catamarca', 'Córdoba', 'Neuquén'],
            'Chile': ['Maule', 'Aconcagua', 'Central', 'Sur', 'Bío Bío', 'Atacama', 'Casablanca', 'Maipo'],
            'Australia': ['Barossa Valley', 'McLaren Vale', 'Margaret River', 'Yarra Valley', 'Hunter Valley', 'Adelaide Hills', 'Coonawarra', 'Heathcote'],
            'Nueva Zelanda': ['Marlborough', 'Hawke\'s Bay', 'Central Otago', 'Wairarapa', 'Auckland', 'Gisborne', 'Waipara', 'Nelson'],
            'USA': ['Napa', 'Sonoma', 'Paso Robles', 'Santa Bárbara', 'Oregon', 'Washington', 'Finger Lakes', 'Virginia'],
            'Canadá': ['Okanagan', 'Niágara', 'British Columbia', 'Alberta', 'Quebec', 'Nova Scotia', 'Prince Edward Island'],
            'Sudáfrica': ['Stellenbosch', 'Paarl', 'Franschhoek', 'Constantia', 'Walker Bay', 'Swartland', 'Elgin', 'Durbanville'],
            'Brasil': ['Río Grande del Sur', 'Santa Catarina', 'Paraná', 'Espíritu Santo', 'Vale dos Vinhedos', 'Campanha Gaúcha', 'Planalto Gaúcho', 'Vale del Submédio'],
            'Grecia': ['Santorini', 'Naoussa', 'Nemea', 'Retsina', 'Creta', 'Peloponeso', 'Tesalia', 'Macedonia'],
            'Hungría': ['Tokaj', 'Villány', 'Eger', 'Egri Bikavér', 'Badacsony', 'Balaton', 'Somló', 'Sopron'],
            'República Checa': ['Moravia', 'Bohemia', 'Mělník', 'Litoměřice', 'Znojmo', 'Mikulov'],
            'Rumania': ['Wallachia', 'Moldavia', 'Transylvania', 'Banat', 'Dealu Mare', 'Drăgășani'],
            'Perú': ['Ica', 'Chincha', 'Nazca', 'Moquegua', 'Tacna', 'Lima', 'Arequipa']
        };
        
        for (const [paisNombre, regiones] of Object.entries(regionesPorPais)) {
            const paisRes = await pool.query('SELECT id FROM paises WHERE nombre = $1', [paisNombre]);
            if (paisRes.rows.length > 0) {
                const paisId = paisRes.rows[0].id;
                for (const region of regiones) {
                    await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2)', [paisId, region]);
                }
            }
        }
        
        await pool.query('INSERT INTO tipos (nombre) VALUES ($1), ($2), ($3), ($4), ($5), ($6)', ['Tinto', 'Blanco', 'Rosado', 'Espumante', 'Jerez/Fortificado', 'Postre']);
        await pool.query('INSERT INTO tipos_movimiento (nombre) VALUES ($1), ($2)', ['Entrada', 'Salida']);
        
        const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
        for (const zona of zonas) {
            const cols = (zona.startsWith('A') || zona.startsWith('D')) ? 20 : 30;
            const zRes = await pool.query('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [zona]);
            const zoneId = zRes.rows[0].id;
            for (let col = 1; col <= cols; col++) {
                for (let fila = 1; fila <= 20; fila++) {
                    await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3)', [zoneId, col, fila]);
                }
            }
        }
        
        res.json({ ok: true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/regiones/:paisId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre', [req.params.paisId]);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/tipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/zonas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM zonas ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/disponibilidad', async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) as total FROM ubicaciones');
        const disp = await pool.query('SELECT COUNT(*) as disponibles FROM ubicaciones WHERE disponible = TRUE');
        const ocup = await pool.query('SELECT COUNT(*) as ocupadas FROM ubicaciones WHERE disponible = FALSE');
        res.json({
            total: parseInt(total.rows[0].total),
            disponibles: parseInt(disp.rows[0].disponibles),
            ocupadas: parseInt(ocup.rows[0].ocupadas)
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/vinos', async (req, res) => {
    try {
        const result = await pool.query(`SELECT v.id, v.nombre, v.codigo_qr, tv.nombre as tipo, p.nombre as pais, r.nombre as region, v.bodega, v.ano, v.cantidad FROM vinos v LEFT JOIN tipos tv ON v.tipo_id = tv.id LEFT JOIN paises p ON v.pais_id = p.id LEFT JOIN regiones r ON v.region_id = r.id ORDER BY v.id DESC LIMIT 20`);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/buscar/:nombre', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.id, v.nombre, v.codigo_qr, v.bodega, v.ano, v.estado, z.nombre as zona, u.columna, u.fila
            FROM vinos v
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE (LOWER(v.nombre) LIKE LOWER($1) OR v.codigo_qr LIKE $1) AND v.estado = 'activa'
            LIMIT 10
        `, ['%' + req.params.nombre + '%']);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/vinos', async (req, res) => {
    const { nombre, tipo_id, pais_id, region_id, bodega, ano, zona_id, columna, fila, cantidad } = req.body;
    if (!nombre || !tipo_id || !zona_id || !columna || !fila) return res.json({ error: 'Faltan datos' });
    try {
        const ubicRes = await pool.query('SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = TRUE', [zona_id, columna, fila]);
        if (ubicRes.rows.length === 0) return res.json({ error: 'Ubicación no disponible' });
        const codigo_qr = crypto.randomBytes(8).toString('hex');
        const vinRes = await pool.query('INSERT INTO vinos (codigo_qr, nombre, tipo_id, pais_id, region_id, bodega, ano, ubicacion_id, cantidad) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id', [codigo_qr, nombre, tipo_id, pais_id || null, region_id || null, bodega || 'Sin especificar', ano || new Date().getFullYear(), ubicRes.rows[0].id, cantidad || 1]);
        await pool.query('UPDATE ubicaciones SET disponible = FALSE WHERE id = $1', [ubicRes.rows[0].id]);
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/salida/:vinoId', async (req, res) => {
    try {
        await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento_id) VALUES ($1, $2)', [req.params.vinoId, 2]);
        await pool.query('UPDATE vinos SET estado = $1 WHERE id = $2', ['salida', req.params.vinoId]);
        await pool.query('UPDATE ubicaciones SET disponible = TRUE WHERE id = (SELECT ubicacion_id FROM vinos WHERE id = $1)', [req.params.vinoId]);
        res.json({ ok: true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wine Collection</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Lora', serif; background: #08091a; color: #f5f5f5; }
        .navbar { background: linear-gradient(135deg, rgba(212,165,116,.1) 0%, transparent 100%); border-bottom: 2px solid rgba(212,165,116,.3); padding: 15px 30px; display: flex; align-items: center; gap: 30px; }
        .logo { font-family: 'Playfair Display', serif; font-size: 1.8em; color: #d4a574; font-weight: 700; letter-spacing: 3px; display: flex; align-items: center; }
        .logo img { height: 60px; margin-right: 15px; }
        .container { display: flex; min-height: calc(100vh - 90px); }
        .sidebar { width: 260px; background: linear-gradient(180deg, rgba(212,165,116,.05) 0%, rgba(160,90,90,.03) 100%); border-right: 2px solid rgba(212,165,116,.2); padding: 30px 0; }
        .nav-item { padding: 16px 24px; color: #a8a8a8; cursor: pointer; font-size: 0.95em; text-transform: uppercase; letter-spacing: 1.5px; border-left: 4px solid transparent; font-weight: 600; transition: all .3s; }
        .nav-item:hover { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.08); }
        .nav-item.active { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.12); }
        .main-content { flex: 1; padding: 40px; overflow-y: auto; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 2.2em; color: #d4a574; margin-bottom: 30px; font-weight: 700; }
        .card { background: rgba(212,165,116,.05); border: 1.5px solid rgba(212,165,116,.2); border-radius: 12px; padding: 30px; margin-bottom: 25px; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 1.2em; color: #d4a574; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; }
        input, select { background: #2a2a3e; border: 1.5px solid rgba(212,165,116,.25); color: #f5f5f5; padding: 12px 14px; border-radius: 8px; font-family: 'Lora', serif; font-size: 0.95em; width: 100%; }
        input:focus, select:focus { outline: 0; border-color: #d4a574; box-shadow: 0 0 15px rgba(212,165,116,.2); }
        label { display: block; font-size: 0.85em; color: #b8b8b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        button { background: linear-gradient(135deg, #d4a574 0%, #a05a5a 100%); color: #000; border: 0; padding: 14px 28px; border-radius: 8px; font-family: 'Lora', serif; font-size: 0.95em; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 1.2px; transition: all .3s; margin-top: 20px; }
        button:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(212,165,116,.3); }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
        .stat-card { background: rgba(212,165,116,.08); border: 1.5px solid rgba(212,165,116,.2); border-radius: 12px; padding: 25px; text-align: center; }
        .stat-value { font-family: 'Playfair Display', serif; font-size: 2.8em; color: #d4a574; margin-bottom: 10px; font-weight: 700; }
        .stat-label { font-size: 0.85em; color: #a8a8a8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { padding: 15px; text-align: left; color: #d4a574; font-weight: 700; text-transform: uppercase; border-bottom: 2px solid #d4a574; font-size: 0.9em; }
        td { padding: 12px 15px; border-bottom: 1px solid rgba(212,165,116,.1); color: #d4d4d4; font-size: 0.9em; }
        #detalles-tabla th { border: 0; color: #a8a8a8; text-transform: none; font-weight: 600; padding: 10px 15px; text-align: left; }
        #detalles-tabla td { border: 0; padding: 10px 15px; }
        #detalles-tabla tr { background: rgba(212,165,116,.05); margin-bottom: 5px; }
        #detalles-tabla tr:hover { background: rgba(212,165,116,.08); }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .msg { color: #d4a574; margin-top: 15px; font-weight: 600; padding: 12px; background: rgba(212,165,116,.1); border-radius: 6px; }
        .error { color: #ff6b6b; background: rgba(255,107,107,.1); }
        .search-results { margin-top: 15px; max-height: 300px; overflow-y: auto; }
        .search-item { padding: 12px; background: rgba(212,165,116,.08); border: 1px solid rgba(212,165,116,.2); border-radius: 6px; margin-bottom: 10px; cursor: pointer; }
        .search-item:hover { background: rgba(212,165,116,.12); }
    </style>
</head>
<body>
    <div class="navbar">
        <div class="logo"><img src="logo_ah.png" alt="Logo" onerror="this.style.display='none'">Wine Collection</div>
    </div>
    
    <div class="container">
        <div class="sidebar">
            <div class="nav-item active" onclick="switchTab('entrada', this)">Entrada</div>
            <div class="nav-item" onclick="switchTab('salida', this)">Salida</div>
            <div class="nav-item" onclick="switchTab('inventario', this)">Inventario</div>
            <div class="nav-item" onclick="switchTab('admin', this)">Administración</div>
        </div>
        
        <div class="main-content">
            <div class="tab-content active" id="tab-entrada">
                <div class="section-title">Registrar Entrada</div>
                <div class="card">
                    <div class="card-title">Información del Vino</div>
                    <div class="form-grid">
                        <div><label>Nombre</label><input type="text" id="nombre" placeholder="Malbec"></div>
                        <div><label>Tipo</label><select id="tipo"><option>--</option></select></div>
                        <div><label>País</label><select id="pais" onchange="cargarRegiones()"><option>--</option></select></div>
                        <div><label>Región</label><select id="region"><option>--</option></select></div>
                        <div><label>Bodega</label><input type="text" id="bodega"></div>
                        <div><label>Año</label><input type="number" id="ano" value="2020"></div>
                        <div><label>Cantidad</label><input type="number" id="cantidad" value="1"></div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title">Ubicación</div>
                    <div class="form-grid">
                        <div><label>Zona</label><select id="zona"><option>--</option></select></div>
                        <div><label>Columna</label><input type="number" id="columna" placeholder="1"></div>
                        <div><label>Fila</label><input type="number" id="fila" placeholder="1"></div>
                    </div>
                    <button onclick="registrar()">📥 GUARDAR ENTRADA</button>
                    <div class="msg" id="msg-entrada"></div>
                </div>
            </div>
            
            <div class="tab-content" id="tab-salida">
                <div class="section-title">Registrar Salida</div>
                <div class="card">
                    <div class="card-title">Buscar Botella</div>
                    <input type="text" id="buscar" placeholder="Nombre o QR" oninput="buscar()">
                    <div class="search-results" id="search-results"></div>
                </div>
                <div class="card" id="card-detalles" style="display: none;">
                    <div class="card-title">Detalles del Vino</div>
                    <table id="detalles-tabla" style="border: none;">
                        <tr><th>Nombre</th><td id="det-nombre"></td></tr>
                        <tr><th>Bodega</th><td id="det-bodega"></td></tr>
                        <tr><th>Año</th><td id="det-ano"></td></tr>
                        <tr><th>QR</th><td id="det-qr"></td></tr>
                        <tr><th>Ubicación</th><td><strong id="det-zona"></strong> - Col <strong id="det-col"></strong> - Fila <strong id="det-fila"></strong></td></tr>
                    </table>
                    <button onclick="confirmarSalida()" style="background: #a05a5a;">✓ CONFIRMAR SALIDA</button>
                    <button onclick="cancelarSalida()" style="background: rgba(212,165,116,.3); margin-left: 10px;">✗ CANCELAR</button>
                    <div class="msg" id="msg-salida"></div>
                </div>
            </div>
            
            <div class="tab-content" id="tab-inventario">
                <div class="section-title">Inventario</div>
                <div class="card">
                    <table><thead><tr><th>Nombre</th><th>Tipo</th><th>País</th><th>Región</th><th>Bodega</th><th>Año</th><th>Cantidad</th></tr></thead><tbody id="tabla"></tbody></table>
                </div>
            </div>
            
            <div class="tab-content" id="tab-admin">
                <div class="section-title">Administración</div>
                <div class="card">
                    <button onclick="init()">INICIALIZAR BD</button>
                    <div class="msg" id="msg-admin"></div>
                </div>
                <div class="stats">
                    <div class="stat-card"><div class="stat-value" id="total">0</div><div class="stat-label">Total</div></div>
                    <div class="stat-card"><div class="stat-value" id="disponibles">0</div><div class="stat-label">Disponibles</div></div>
                    <div class="stat-card"><div class="stat-value" id="ocupadas">0</div><div class="stat-label">Ocupadas</div></div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        function switchTab(tab, elem) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
            elem.classList.add('active');
            if (tab === 'inventario') cargarVinos();
        }
        
        function cargar() {
            fetch('/api/tipos').then(r => r.json()).then(d => {
                const s = document.getElementById('tipo');
                s.innerHTML = '<option>--</option>';
                d.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.text = t.nombre; s.appendChild(o); });
            });
            fetch('/api/paises').then(r => r.json()).then(d => {
                const s = document.getElementById('pais');
                s.innerHTML = '<option>--</option>';
                d.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.text = p.nombre; s.appendChild(o); });
            });
            fetch('/api/zonas').then(r => r.json()).then(d => {
                const s = document.getElementById('zona');
                s.innerHTML = '<option>--</option>';
                d.forEach(z => { const o = document.createElement('option'); o.value = z.id; o.text = z.nombre; s.appendChild(o); });
            });
            cargarEstadisticas();
        }
        
        function cargarRegiones() {
            const id = document.getElementById('pais').value;
            const s = document.getElementById('region');
            if (!id) { s.innerHTML = '<option>--</option>'; return; }
            fetch('/api/regiones/' + id).then(r => r.json()).then(d => {
                s.innerHTML = '<option>--</option>';
                d.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.text = r.nombre; s.appendChild(o); });
            });
        }
        
        function cargarEstadisticas() {
            fetch('/api/disponibilidad').then(r => r.json()).then(d => {
                document.getElementById('total').textContent = d.total || '0';
                document.getElementById('disponibles').textContent = d.disponibles || '0';
                document.getElementById('ocupadas').textContent = d.ocupadas || '0';
            });
        }
        
        function cargarVinos() {
            fetch('/api/vinos').then(r => r.json()).then(d => {
                const t = document.getElementById('tabla');
                const activos = d.filter(v => v.estado !== 'salida');
                if (activos.length === 0) {
                    t.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #888;">Sin botellas en inventario</td></tr>';
                } else {
                    t.innerHTML = activos.map(v => '<tr><td>' + v.nombre + '</td><td>' + (v.tipo || '-') + '</td><td>' + (v.pais || '-') + '</td><td>' + (v.region || '-') + '</td><td>' + (v.bodega || '-') + '</td><td>' + v.ano + '</td><td>' + v.cantidad + '</td></tr>').join('');
                }
            });
        }
        
        function registrar() {
            const n = document.getElementById('nombre').value;
            const t = document.getElementById('tipo').value;
            const z = document.getElementById('zona').value;
            if (!n || !t || !z) { alert('Faltan datos'); return; }
            fetch('/api/vinos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nombre: n, tipo_id: parseInt(t), pais_id: document.getElementById('pais').value || null,
                    region_id: document.getElementById('region').value || null, bodega: document.getElementById('bodega').value,
                    ano: parseInt(document.getElementById('ano').value), cantidad: parseInt(document.getElementById('cantidad').value),
                    zona_id: parseInt(z), columna: parseInt(document.getElementById('columna').value), fila: parseInt(document.getElementById('fila').value)
                })
            }).then(r => r.json()).then(d => {
                const msg = document.getElementById('msg-entrada');
                if (d.ok) { msg.textContent = '✓ Registrado'; msg.classList.remove('error'); document.getElementById('nombre').value = ''; cargarEstadisticas(); }
                else { msg.textContent = '✗ Error: ' + d.error; msg.classList.add('error'); }
            });
        }
        
        let vinoSeleccionado = null;
        
        function buscar() {
            const q = document.getElementById('buscar').value;
            if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; document.getElementById('card-detalles').style.display = 'none'; return; }
            fetch('/api/buscar/' + encodeURIComponent(q)).then(r => r.json()).then(d => {
                const res = document.getElementById('search-results');
                if (d.length === 0) {
                    res.innerHTML = '<div style="color: #888; padding: 10px;">No encontrado</div>';
                    document.getElementById('card-detalles').style.display = 'none';
                } else {
                    res.innerHTML = d.map(v => '<div class="search-item" onclick="seleccionarVino(' + v.id + ', \\'' + v.nombre.replace(/'/g, "\\'") + '\\', \\'' + (v.bodega || '').replace(/'/g, "\\'") + '\\', ' + v.ano + ', \\'' + v.codigo_qr + '\\', \\'' + (v.zona || '') + '\\', ' + v.columna + ', ' + v.fila + ')">' + v.nombre + ' (' + v.ano + ')<br><small>📍 ' + (v.zona || 'Sin ubicación') + ' - Col ' + v.columna + ', Fila ' + v.fila + '</small></div>').join('');
                }
            });
        }
        
        function seleccionarVino(id, nombre, bodega, ano, qr, zona, col, fila) {
            vinoSeleccionado = id;
            document.getElementById('det-nombre').textContent = nombre;
            document.getElementById('det-bodega').textContent = bodega || '-';
            document.getElementById('det-ano').textContent = ano;
            document.getElementById('det-qr').textContent = qr;
            document.getElementById('det-zona').textContent = zona;
            document.getElementById('det-col').textContent = col;
            document.getElementById('det-fila').textContent = fila;
            document.getElementById('card-detalles').style.display = 'block';
        }
        
        function confirmarSalida() {
            if (!vinoSeleccionado) return;
            fetch('/api/salida/' + vinoSeleccionado, { method: 'POST' }).then(r => r.json()).then(d => {
                const msg = document.getElementById('msg-salida');
                if (d.ok) { 
                    msg.textContent = '✓ Salida registrada correctamente'; 
                    msg.classList.remove('error');
                    document.getElementById('buscar').value = '';
                    document.getElementById('search-results').innerHTML = '';
                    setTimeout(() => { document.getElementById('card-detalles').style.display = 'none'; }, 1500);
                    cargarEstadisticas();
                    vinoSeleccionado = null;
                }
                else { 
                    msg.textContent = '✗ Error: ' + d.error; 
                    msg.classList.add('error'); 
                }
            });
        }
        
        function cancelarSalida() {
            document.getElementById('card-detalles').style.display = 'none';
            document.getElementById('buscar').value = '';
            document.getElementById('search-results').innerHTML = '';
            vinoSeleccionado = null;
        }
        
        function init() {
            fetch('/setup').then(r => r.json()).then(d => {
                const msg = document.getElementById('msg-admin');
                if (d.ok) { msg.textContent = '✓ Inicializado'; msg.classList.remove('error'); setTimeout(cargar, 500); }
                else { msg.textContent = '✗ Error'; msg.classList.add('error'); }
            });
        }
        
        cargar();
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Puerto ' + PORT));
