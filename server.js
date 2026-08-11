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

// ===== SETUP: Crear tablas y datos iniciales =====
app.get('/setup', async (req, res) => {
    try {
        // Eliminar tablas viejas
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_movimiento CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        // Crear tablas
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE regiones (id SERIAL PRIMARY KEY, pais_id INT REFERENCES paises(id), nombre VARCHAR(100))');
        await pool.query('CREATE TABLE tipos (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE tipos_movimiento (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) UNIQUE)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INT REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
        await pool.query(`CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(100) UNIQUE, nombre VARCHAR(200), tipo_id INT REFERENCES tipos(id), pais_id INT REFERENCES paises(id), region_id INT REFERENCES regiones(id), bodega VARCHAR(100), ano INT, ubicacion_id INT REFERENCES ubicaciones(id), cantidad INT DEFAULT 1, estado VARCHAR(50) DEFAULT 'activa')`);
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INT REFERENCES vinos(id), tipo_movimiento_id INT REFERENCES tipos_movimiento(id), fecha TIMESTAMP DEFAULT NOW())');
        
        // PAISES PRODUCTORES DE VINOS
        const paises = [
            'Francia', 'Italia', 'España', 'Portugal', 'Alemania',
            'Austria', 'Suiza', 'Croacia', 'Argentina', 'Chile', 'Australia',
            'Nueva Zelanda', 'USA', 'Canadá', 'Sudáfrica', 'Brasil',
            'Grecia', 'Hungría', 'República Checa', 'Rumania', 'Perú'
        ];
        for (const pais of paises) {
            await pool.query('INSERT INTO paises (nombre) VALUES ($1)', [pais]);
        }
        
        // REGIONES POR PAÍS PRODUCTOR
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
            'Brasil': ['Río Grande del Sur', 'Santa Catarina', 'Paraná', 'Espíritu Santo', 'Vale dos Vinhedos', 'Campanha Gaúcha', 'Planalto Gaúcho', 'Vale do Submédio'],
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
        
        // Insertar tipos de vino
        await pool.query('INSERT INTO tipos (nombre) VALUES ($1), ($2), ($3), ($4), ($5), ($6)', 
            ['Tinto', 'Blanco', 'Rosado', 'Espumante', 'Jerez/Fortificado', 'Postre']);
        
        // Insertar tipos de movimiento
        await pool.query('INSERT INTO tipos_movimiento (nombre) VALUES ($1), ($2), ($3)', 
            ['Entrada', 'Salida', 'Consumo']);
        
        // Insertar zonas y ubicaciones
        const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
        for (const zona of zonas) {
            const cols = (zona.startsWith('A') || zona.startsWith('D')) ? 20 : 30;
            const zRes = await pool.query('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [zona]);
            const zoneId = zRes.rows[0].id;
            
            for (let col = 1; col <= cols; col++) {
                for (let fila = 1; fila <= 20; fila++) {
                    await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3)', 
                        [zoneId, col, fila]);
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

app.get('/api/tipos-movimiento', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_movimiento ORDER BY nombre');
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
        
        // Registrar movimiento si se proporciona
        if (tipo_movimiento_id) {
            await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento_id) VALUES ($1, $2)', [vinRes.rows[0].id, tipo_movimiento_id]);
        }
        
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== HTML =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodegas</title>
    <style>
        body { font-family: Arial; background: #08091a; color: #f5f5f5; padding: 20px; margin: 0; }
        h1 { color: #d4a574; margin-bottom: 30px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .section { background: #1a1a2e; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #d4a574; }
        .section h2 { color: #d4a574; margin-top: 0; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
        input, select { background: #2a2a3e; color: #f5f5f5; border: 1px solid #d4a574; padding: 8px; border-radius: 4px; font-size: 14px; width: 100%; }
        button { background: #d4a574; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        button:hover { opacity: 0.8; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .stat-card { background: #2a2a3e; padding: 15px; border-radius: 6px; text-align: center; border: 1px solid #d4a574; }
        .stat-value { font-size: 2em; color: #d4a574; font-weight: bold; }
        .stat-label { color: #888; font-size: 0.9em; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th { background: #2a2a3e; padding: 10px; text-align: left; color: #d4a574; border-bottom: 2px solid #d4a574; font-size: 0.9em; }
        td { padding: 10px; border-bottom: 1px solid #d4a574; font-size: 0.85em; }
        tr:hover { background: #2a2a3e; }
        .msg { color: #d4a574; margin-top: 10px; font-weight: bold; }
        .error { color: #ff6b6b; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍷 BODEGAS - Gestión de Inventario</h1>
        
        <div class="section">
            <h2>Registrar Botella</h2>
            <div class="form-grid">
                <div><label>Nombre</label><input type="text" id="nombre" placeholder="Malbec Reserve"></div>
                <div><label>Tipo</label><select id="tipo"><option>-- Seleccionar --</option></select></div>
                <div><label>País</label><select id="pais" onchange="cargarRegiones()"><option>-- Seleccionar --</option></select></div>
                <div><label>Región</label><select id="region"><option>-- Seleccionar País --</option></select></div>
                <div><label>Bodega</label><input type="text" id="bodega" placeholder="Bodega"></div>
                <div><label>Año</label><input type="number" id="ano" placeholder="2020" min="1900" max="2099"></div>
                <div><label>Cantidad</label><input type="number" id="cantidad" placeholder="1" min="1" value="1"></div>
                <div><label>Movimiento</label><select id="movimiento"><option>-- Seleccionar --</option></select></div>
                <div><label>Zona</label><select id="zona"><option>-- Seleccionar --</option></select></div>
                <div><label>Columna</label><input type="number" id="columna" placeholder="1" min="1"></div>
                <div><label>Fila</label><input type="number" id="fila" placeholder="1" min="1" max="20"></div>
            </div>
            <button onclick="registrar()">GUARDAR BOTELLA</button>
            <div class="msg" id="msg"></div>
        </div>
        
        <div class="section">
            <h2>Estadísticas</h2>
            <div class="stats">
                <div class="stat-card">
                    <div class="stat-value" id="total">0</div>
                    <div class="stat-label">TOTAL UBICACIONES</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="disponibles">0</div>
                    <div class="stat-label">DISPONIBLES</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" id="ocupadas">0</div>
                    <div class="stat-label">OCUPADAS</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Inventario</h2>
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
        
        <div class="section">
            <h2>Administración</h2>
            <button onclick="init()">INICIALIZAR BD</button>
        </div>
    </div>
    
    <script>
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
            
            fetch('/api/tipos-movimiento').then(r => r.json()).then(d => {
                const sel = document.getElementById('movimiento');
                sel.innerHTML = '<option>-- Seleccionar --</option>';
                d.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.text = m.nombre; sel.appendChild(o); });
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
                    t.innerHTML = '<tr><td colspan="8" style="text-align: center;">Sin botellas registradas</td></tr>';
                } else {
                    t.innerHTML = d.map(v => '<tr><td>' + v.nombre + '</td><td>' + (v.tipo || '-') + '</td><td>' + (v.pais || '-') + '</td><td>' + (v.region || '-') + '</td><td>' + (v.bodega || '-') + '</td><td>' + v.ano + '</td><td>' + v.cantidad + '</td><td>' + v.codigo_qr.substring(0, 8) + '</td></tr>').join('');
                }
            });
        }
        
        function registrar() {
            const n = document.getElementById('nombre').value;
            const t = document.getElementById('tipo').value;
            const p = document.getElementById('pais').value;
            const r = document.getElementById('region').value;
            const b = document.getElementById('bodega').value;
            const a = document.getElementById('ano').value;
            const cant = document.getElementById('cantidad').value;
            const mov = document.getElementById('movimiento').value;
            const z = document.getElementById('zona').value;
            const c = document.getElementById('columna').value;
            const f = document.getElementById('fila').value;
            
            if (!n || !t || !z || !c || !f) { 
                document.getElementById('msg').textContent = '✗ Completa todos los campos requeridos';
                document.getElementById('msg').className = 'msg error';
                return; 
            }
            
            fetch('/api/vinos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: n, tipo_id: parseInt(t), pais_id: p ? parseInt(p) : null, region_id: r ? parseInt(r) : null, bodega: b, ano: a ? parseInt(a) : null, cantidad: cant ? parseInt(cant) : 1, tipo_movimiento_id: mov ? parseInt(mov) : null, zona_id: parseInt(z), columna: parseInt(c), fila: parseInt(f) })
            }).then(r => r.json()).then(d => {
                const msg = document.getElementById('msg');
                if (d.ok) { 
                    msg.textContent = '✓ Botella registrada: ' + d.codigo_qr;
                    msg.className = 'msg';
                    document.getElementById('nombre').value = ''; 
                    document.getElementById('bodega').value = ''; 
                    document.getElementById('ano').value = ''; 
                    document.getElementById('cantidad').value = '1';
                    cargarEstadisticas();
                    cargarVinos();
                }
                else { 
                    msg.textContent = '✗ Error: ' + d.error;
                    msg.className = 'msg error';
                }
            });
        }
        
        function init() {
            fetch('/setup').then(r => r.json()).then(d => {
                if (d.ok) { 
                    alert('✓ BD inicializada correctamente'); 
                    setTimeout(cargar, 500); 
                }
                else alert('✗ Error: ' + d.error);
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
