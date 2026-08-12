const express = require('express');
const cors = require('cors');
const pg = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Deshabilitar caché
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

// ===== SETUP =====
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
        
        await pool.query('INSERT INTO tipos (nombre) VALUES ($1), ($2), ($3), ($4), ($5), ($6)', 
            ['Tinto', 'Blanco', 'Rosado', 'Espumante', 'Jerez/Fortificado', 'Postre']);
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
        
        res.json({ ok: true, message: 'BD inicializada' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== APIS =====
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
        const result = await pool.query(`
            SELECT v.id, v.nombre, v.codigo_qr, tv.nombre as tipo, p.nombre as pais, r.nombre as region, v.bodega, v.ano, v.cantidad, v.estado
            FROM vinos v
            LEFT JOIN tipos tv ON v.tipo_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            ORDER BY v.id DESC LIMIT 20
        `);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/vinos', async (req, res) => {
    const { nombre, tipo_id, pais_id, region_id, bodega, ano, zona_id, columna, fila, cantidad, tipo_movimiento_id } = req.body;
    
    if (!nombre || !tipo_id || !zona_id || !columna || !fila) {
        return res.json({ error: 'Faltan datos requeridos' });
    }
    
    try {
        const ubicRes = await pool.query(
            'SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = TRUE',
            [zona_id, columna, fila]
        );
        
        if (ubicRes.rows.length === 0) {
            return res.json({ error: 'Ubicación no disponible' });
        }
        
        const codigo_qr = crypto.randomBytes(8).toString('hex');
        const vinRes = await pool.query(
            'INSERT INTO vinos (codigo_qr, nombre, tipo_id, pais_id, region_id, bodega, ano, ubicacion_id, cantidad) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
            [codigo_qr, nombre, tipo_id, pais_id || null, region_id || null, bodega || 'Sin especificar', ano || new Date().getFullYear(), ubicRes.rows[0].id, cantidad || 1]
        );
        
        await pool.query('UPDATE ubicaciones SET disponible = FALSE WHERE id = $1', [ubicRes.rows[0].id]);
        
        if (tipo_movimiento_id) {
            await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento_id) VALUES ($1, $2)', [vinRes.rows[0].id, tipo_movimiento_id]);
        }
        
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== HTML CON DISEÑO PREMIUM =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodegas</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Lora', serif; background: #08091a; color: #f5f5f5; }
        
        .navbar { background: linear-gradient(135deg, rgba(212,165,116,.1) 0%, transparent 100%); border-bottom: 2px solid rgba(212,165,116,.3); padding: 20px 30px; display: flex; align-items: center; gap: 30px; position: sticky; top: 0; z-index: 100; }
        .logo { font-family: 'Playfair Display', serif; font-size: 1.8em; color: #d4a574; font-weight: 700; letter-spacing: 3px; display: flex; align-items: center; }
        
        .container { display: flex; min-height: calc(100vh - 75px); }
        .sidebar { width: 260px; background: linear-gradient(180deg, rgba(212,165,116,.05) 0%, rgba(160,90,90,.03) 100%); border-right: 2px solid rgba(212,165,116,.2); padding: 30px 0; }
        .nav-item { padding: 16px 24px; color: #a8a8a8; cursor: pointer; font-size: 0.95em; text-transform: uppercase; letter-spacing: 1.5px; border-left: 4px solid transparent; font-weight: 600; transition: all .3s; }
        .nav-item:hover { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.08); }
        .nav-item.active { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.12); }
        
        .main-content { flex: 1; padding: 40px; overflow-y: auto; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 2.2em; color: #d4a574; margin-bottom: 30px; font-weight: 700; letter-spacing: 1px; }
        
        .card { background: rgba(212,165,116,.05); border: 1.5px solid rgba(212,165,116,.2); border-radius: 12px; padding: 30px; margin-bottom: 25px; }
        .card-title { font-family: 'Playfair Display', serif; font-size: 1.2em; color: #d4a574; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; }
        
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 15px; }
        input, select { background: rgba(255,255,255,.05); border: 1.5px solid rgba(212,165,116,.25); color: #f5f5f5; padding: 12px 14px; border-radius: 8px; font-family: 'Lora', serif; font-size: 0.95em; width: 100%; transition: all .3s; }
        input:focus, select:focus { outline: 0; border-color: #d4a574; background: rgba(212,165,116,.1); box-shadow: 0 0 15px rgba(212,165,116,.2); }
        label { display: block; font-size: 0.85em; color: #b8b8b8; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        
        .button-group { margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap; }
        button { background: linear-gradient(135deg, #d4a574 0%, #a05a5a 100%); color: #000; border: 0; padding: 14px 28px; border-radius: 8px; font-family: 'Lora', serif; font-size: 0.95em; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 1.2px; transition: all .3s; }
        button:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(212,165,116,.3); }
        
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
        .stat-card { background: rgba(212,165,116,.08); border: 1.5px solid rgba(212,165,116,.2); border-radius: 12px; padding: 25px; text-align: center; }
        .stat-value { font-family: 'Playfair Display', serif; font-size: 2.8em; color: #d4a574; margin-bottom: 10px; font-weight: 700; }
        .stat-label { font-size: 0.85em; color: #a8a8a8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th { padding: 15px; text-align: left; color: #d4a574; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #d4a574; font-size: 0.9em; }
        td { padding: 12px 15px; border-bottom: 1px solid rgba(212,165,116,.1); color: #d4d4d4; font-size: 0.9em; }
        tr:hover { background: rgba(212,165,116,.05); }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        .msg { color: #d4a574; margin-top: 15px; font-weight: 600; padding: 12px; background: rgba(212,165,116,.1); border-radius: 6px; }
        .error { color: #ff6b6b; background: rgba(255,107,107,.1); }
        
        @media (max-width: 768px) {
            .container { flex-direction: column; }
            .sidebar { width: 100%; padding: 15px 0; display: flex; gap: 10px; overflow-x: auto; border-right: none; border-bottom: 2px solid rgba(212,165,116,.2); }
            .nav-item { padding: 12px 20px; white-space: nowrap; }
            .main-content { padding: 20px; }
            .form-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="navbar">
        <div class="logo"><img src="logo_ah.png" alt="Logo" style="height: 50px; margin-right: 15px; vertical-align: middle;">Wine Collection</div>
    </div>
    
    <div class="container">
        <div class="sidebar">
            <div class="nav-item active" onclick="switchTab('movimientos', this)">Movimientos</div>
            <div class="nav-item" onclick="switchTab('inventario', this)">Inventario</div>
            <div class="nav-item" onclick="switchTab('admin', this)">Administración</div>
        </div>
        
        <div class="main-content">
            <!-- TAB: MOVIMIENTOS -->
            <div class="tab-content active" id="tab-movimientos">
                <div class="section-title">Registrar Botella</div>
                
                <div class="card">
                    <div class="card-title">Información del Vino</div>
                    <div class="form-grid">
                        <div><label>Nombre</label><input type="text" id="nombre" placeholder="Malbec Reserve"></div>
                        <div><label>Tipo</label><select id="tipo"><option>-- Seleccionar --</option></select></div>
                        <div><label>País</label><select id="pais" onchange="cargarRegiones()"><option>-- Seleccionar --</option></select></div>
                        <div><label>Región</label><select id="region"><option>-- Seleccionar País --</option></select></div>
                        <div><label>Bodega</label><input type="text" id="bodega" placeholder="Bodega"></div>
                        <div><label>Año</label><input type="number" id="ano" placeholder="2020" min="1900" max="2099"></div>
                        <div><label>Cantidad</label><input type="number" id="cantidad" placeholder="1" min="1" value="1"></div>
                    </div>
                </div>
                
                <div class="card">
                    <div class="card-title">Ubicación en Bodega</div>
                    <div class="form-grid">
                        <div><label>Zona</label><select id="zona"><option>-- Seleccionar --</option></select></div>
                        <div><label>Columna</label><input type="number" id="columna" placeholder="1" min="1"></div>
                        <div><label>Fila</label><input type="number" id="fila" placeholder="1" min="1" max="20"></div>
                    </div>
                    <div class="button-group">
                        <button onclick="registrar(1)">📥 ENTRADA</button>
                        <button onclick="registrar(2)">📤 SALIDA</button>
                    </div>
                    <div class="msg" id="msg"></div>
                </div>
                
                <div class="section-title" style="margin-top: 40px;">Estadísticas</div>
                <div class="stats">
                    <div class="stat-card">
                        <div class="stat-value" id="total">0</div>
                        <div class="stat-label">Total Ubicaciones</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="disponibles">0</div>
                        <div class="stat-label">Disponibles</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value" id="ocupadas">0</div>
                        <div class="stat-label">Ocupadas</div>
                    </div>
                </div>
            </div>
            
            <!-- TAB: INVENTARIO -->
            <div class="tab-content" id="tab-inventario">
                <div class="section-title">Inventario</div>
                <div class="card">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>País</th>
                                <th>Región</th>
                                <th>Bodega</th>
                                <th>Año</th>
                                <th>Cantidad</th>
                                <th>QR</th>
                            </tr>
                        </thead>
                        <tbody id="tabla"></tbody>
                    </table>
                </div>
            </div>
            
            <!-- TAB: ADMIN -->
            <div class="tab-content" id="tab-admin">
                <div class="section-title">Administración</div>
                <div class="card">
                    <div class="card-title">Base de Datos</div>
                    <button onclick="init()">INICIALIZAR BD</button>
                    <div class="msg" id="admin-msg"></div>
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
                const sel = document.getElementById('tipo');
                sel.innerHTML = '<option>-- Seleccionar --</option>';
                d.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.text = t.nombre; sel.appendChild(o); });
            });
            
            fetch('/api/paises').then(r => r.json()).then(d => {
                const sel = document.getElementById('pais');
                sel.innerHTML = '<option>-- Seleccionar --</option>';
                d.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.text = p.nombre; sel.appendChild(o); });
            });
            
            fetch('/api/zonas').then(r => r.json()).then(d => {
                const sel = document.getElementById('zona');
                sel.innerHTML = '<option>-- Seleccionar --</option>';
                d.forEach(z => { const o = document.createElement('option'); o.value = z.id; o.text = z.nombre; sel.appendChild(o); });
            });
            
            cargarEstadisticas();
            cargarVinos();
        }
        
        function cargarRegiones() {
            const paisId = document.getElementById('pais').value;
            const sel = document.getElementById('region');
            
            if (!paisId) {
                sel.innerHTML = '<option>-- Seleccionar País --</option>';
                return;
            }
            
            fetch('/api/regiones/' + paisId).then(r => r.json()).then(d => {
                sel.innerHTML = '<option>-- Seleccionar --</option>';
                d.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.text = r.nombre; sel.appendChild(o); });
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
                if (d.length === 0) {
                    t.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #888;">Sin botellas registradas</td></tr>';
                } else {
                    t.innerHTML = d.map(v => '<tr><td>' + v.nombre + '</td><td>' + (v.tipo || '-') + '</td><td>' + (v.pais || '-') + '</td><td>' + (v.region || '-') + '</td><td>' + (v.bodega || '-') + '</td><td>' + v.ano + '</td><td style="text-align: center;">' + v.cantidad + '</td><td>' + v.codigo_qr.substring(0, 8) + '</td></tr>').join('');
                }
            });
        }
        
        function registrar(tipoMovimiento) {
            const n = document.getElementById('nombre').value;
            const t = document.getElementById('tipo').value;
            const p = document.getElementById('pais').value;
            const r = document.getElementById('region').value;
            const b = document.getElementById('bodega').value;
            const a = document.getElementById('ano').value;
            const cant = document.getElementById('cantidad').value;
            const z = document.getElementById('zona').value;
            const c = document.getElementById('columna').value;
            const f = document.getElementById('fila').value;
            
            if (!n || !t || !z || !c || !f) { 
                document.getElementById('msg').textContent = '✗ Completa todos los campos requeridos';
                document.getElementById('msg').classList.add('error');
                return; 
            }
            
            fetch('/api/vinos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: n, tipo_id: parseInt(t), pais_id: p ? parseInt(p) : null, region_id: r ? parseInt(r) : null, bodega: b, ano: a ? parseInt(a) : null, cantidad: cant ? parseInt(cant) : 1, tipo_movimiento_id: tipoMovimiento, zona_id: parseInt(z), columna: parseInt(c), fila: parseInt(f) })
            }).then(r => r.json()).then(d => {
                const msg = document.getElementById('msg');
                if (d.ok) { 
                    msg.textContent = '✓ Botella registrada: ' + d.codigo_qr;
                    msg.classList.remove('error');
                    document.getElementById('nombre').value = ''; 
                    document.getElementById('bodega').value = ''; 
                    document.getElementById('ano').value = ''; 
                    document.getElementById('cantidad').value = '1';
                    cargarEstadisticas();
                    cargarVinos();
                }
                else { 
                    msg.textContent = '✗ Error: ' + d.error;
                    msg.classList.add('error');
                }
            });
        }
        
        function init() {
            fetch('/setup').then(r => r.json()).then(d => {
                const msg = document.getElementById('admin-msg');
                if (d.ok) { 
                    msg.textContent = '✓ BD inicializada correctamente'; 
                    msg.classList.remove('error');
                    setTimeout(cargar, 500); 
                }
                else { 
                    msg.textContent = '✗ Error: ' + d.error;
                    msg.classList.add('error');
                }
            });
        }
        
        cargar();
        setInterval(cargarEstadisticas, 5000);
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Puerto ' + PORT));
