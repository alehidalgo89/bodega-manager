const express = require('express');
const cors = require('cors');
const pg = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// ===== SETUP: Crear BD y datos iniciales =====
app.get('/setup', async (req, res) => {
    try {
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vino_variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_vino CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        // Crear tablas
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE regiones (id SERIAL PRIMARY KEY, pais_id INT REFERENCES paises(id), nombre VARCHAR(100))');
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INT REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
        await pool.query(`CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(100) UNIQUE, nombre VARCHAR(200), tipo_id INT REFERENCES tipos_vino(id), pais_id INT REFERENCES paises(id), bodega VARCHAR(100), ano INT, ubicacion_id INT REFERENCES ubicaciones(id), estado VARCHAR(50) DEFAULT 'activa', fecha_ingreso TIMESTAMP DEFAULT NOW())`);
        await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INT REFERENCES vinos(id), variedad_id INT REFERENCES variedades(id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INT REFERENCES vinos(id), tipo VARCHAR(50), fecha TIMESTAMP DEFAULT NOW())');
        
        // Insertar datos iniciales
        await pool.query('INSERT INTO paises (nombre) VALUES ($1), ($2), ($3), ($4), ($5)', 
            ['Argentina', 'Chile', 'España', 'Italia', 'Francia']);
        await pool.query('INSERT INTO tipos_vino (nombre) VALUES ($1), ($2), ($3), ($4)', 
            ['Tinto', 'Blanco', 'Rosado', 'Espumante']);
        await pool.query('INSERT INTO variedades (nombre) VALUES ($1), ($2), ($3), ($4), ($5), ($6)', 
            ['Malbec', 'Cabernet Sauvignon', 'Chardonnay', 'Syrah', 'Merlot', 'Pinot Noir']);
        
        // Crear zonas y ubicaciones
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
        
        res.json({ ok: true, message: 'Base de datos inicializada correctamente' });
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

app.get('/api/tipos', async (req, res) => {
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
        const disp = await pool.query('SELECT COUNT(*) as disp FROM ubicaciones WHERE disponible = TRUE');
        res.json({
            total: parseInt(total.rows[0].total),
            disponibles: parseInt(disp.rows[0].disp),
            ocupadas: parseInt(total.rows[0].total) - parseInt(disp.rows[0].disp)
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/registrar', async (req, res) => {
    const { nombre, tipo_id, pais_id, bodega, ano, zona_id, columna, fila } = req.body;
    if (!nombre || !tipo_id || !zona_id || !columna || !fila) 
        return res.json({ error: 'Datos requeridos' });
    
    try {
        const ubicRes = await pool.query('SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = TRUE', 
            [zona_id, columna, fila]);
        if (ubicRes.rows.length === 0) 
            return res.json({ error: 'Ubicación no disponible' });
        
        const codigo_qr = crypto.randomBytes(8).toString('hex');
        const vinRes = await pool.query('INSERT INTO vinos (codigo_qr, nombre, tipo_id, pais_id, bodega, ano, ubicacion_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [codigo_qr, nombre, tipo_id, pais_id, bodega || 'Default', ano || new Date().getFullYear(), ubicRes.rows[0].id]);
        
        await pool.query('UPDATE ubicaciones SET disponible = FALSE WHERE id = $1', [ubicRes.rows[0].id]);
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/movimiento/:vinoId', async (req, res) => {
    const { tipo } = req.body;
    if (!tipo) return res.json({ error: 'Tipo requerido' });
    
    try {
        await pool.query('INSERT INTO movimientos (vino_id, tipo) VALUES ($1, $2)', [req.params.vinoId, tipo]);
        res.json({ ok: true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/inventario', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.id, v.nombre, tv.nombre as tipo, v.ano, v.bodega, v.estado
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_id = tv.id
            ORDER BY v.fecha_ingreso DESC LIMIT 20
        `);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== HTML PRINCIPAL =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodegas</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@500;600&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Lora', serif; background: #08091a; color: #f5f5f5; display: flex; height: 100vh; }
        
        .navbar { background: linear-gradient(135deg, rgba(212,165,116,.08) 0%, transparent 100%); border-bottom: 2px solid rgba(212,165,116,.25); padding: 15px 25px; display: flex; align-items: center; gap: 20px; min-height: 65px; }
        .logo { font-family: 'Playfair Display', serif; font-size: 1.5em; color: #d4a574; font-weight: 700; letter-spacing: 2px; }
        .search { flex: 1; max-width: 450px; }
        .search input { width: 100%; background: rgba(255,255,255,.08); border: 1.5px solid rgba(212,165,116,.3); color: #f5f5f5; padding: 10px 14px; border-radius: 6px; font-family: 'Lora', serif; }
        
        .container { display: flex; flex: 1; overflow: hidden; }
        .sidebar { width: 240px; background: linear-gradient(180deg, rgba(212,165,116,.04) 0%, transparent 100%); border-right: 1.5px solid rgba(212,165,116,.2); overflow-y: auto; }
        .nav-item { padding: 15px 20px; color: #a8a8a8; cursor: pointer; font-size: .9em; text-transform: uppercase; letter-spacing: 1px; border-left: 4px solid transparent; font-weight: 600; transition: all .3s; }
        .nav-item:hover { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.08); }
        .nav-item.active { color: #d4a574; border-left-color: #d4a574; background: rgba(212,165,116,.12); }
        
        .main-content { flex: 1; overflow-y: auto; padding: 40px; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 2em; color: #d4a574; margin-bottom: 25px; font-weight: 700; }
        
        .card { background: rgba(212,165,116,.06); border: 1.5px solid rgba(212,165,116,.2); border-radius: 12px; padding: 25px; margin-bottom: 20px; }
        .card-title { font-size: .95em; color: #d4a574; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 1.2px; font-weight: 700; }
        
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; }
        input, select { background: rgba(255,255,255,.06); border: 1.5px solid rgba(212,165,116,.25); color: #f5f5f5; padding: 11px 13px; border-radius: 6px; font-family: 'Lora', serif; font-size: .9em; width: 100%; }
        input:focus, select:focus { outline: 0; border-color: #d4a574; background: rgba(212,165,116,.1); }
        label { display: block; font-size: .8em; color: #b8b8b8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: .8px; font-weight: 600; }
        
        button { background: linear-gradient(135deg, #d4a574 0%, #a05a5a 100%); color: #000; border: 0; padding: 12px 30px; border-radius: 6px; font-family: 'Lora', serif; font-size: .9em; font-weight: 700; cursor: pointer; text-transform: uppercase; letter-spacing: 1px; margin-top: 15px; }
        button:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(212,165,116,.25); }
        
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 25px 0; }
        .stat-card { background: rgba(212,165,116,.08); border: 1.5px solid rgba(212,165,116,.2); border-radius: 10px; padding: 20px; text-align: center; }
        .stat-value { font-family: 'Playfair Display', serif; font-size: 2em; color: #d4a574; margin-bottom: 8px; font-weight: 700; }
        .stat-label { font-size: .8em; color: #a8a8a8; text-transform: uppercase; letter-spacing: .8px; font-weight: 600; }
        
        table { width: 100%; border-collapse: collapse; font-size: .85em; }
        th { padding: 12px; text-align: left; color: #d4a574; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; border-bottom: 2px solid #d4a574; }
        td { padding: 12px; border-bottom: 1px solid rgba(212,165,116,.1); color: #a8a8a8; }
        
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        @media (max-width: 768px) {
            .sidebar { width: 0; position: absolute; }
            .form-grid { grid-template-columns: 1fr; }
            .stats { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div style="width: 100%; display: flex; flex-direction: column;">
        <div class="navbar">
            <div class="logo">BODEGAS</div>
            <div class="search"><input type="text" placeholder="Buscar..."></div>
        </div>
        
        <div class="container">
            <div class="sidebar">
                <div class="nav-item active" onclick="switchTab('movimientos', this)">Movimientos</div>
                <div class="nav-item" onclick="switchTab('inventario', this)">Inventario</div>
                <div class="nav-item" onclick="switchTab('admin', this)">Administración</div>
            </div>
            
            <div class="main-content">
                <!-- MOVIMIENTOS -->
                <div class="tab-content active" id="tab-movimientos">
                    <div class="section-title">Registrar Botellas</div>
                    <div class="card">
                        <div class="card-title">Información del Vino</div>
                        <div class="form-grid">
                            <div><label>Nombre</label><input type="text" id="nombre" placeholder="Malbec"></div>
                            <div><label>Tipo</label><select id="tipo"><option>Cargar...</option></select></div>
                            <div><label>País</label><select id="pais"><option>Cargar...</option></select></div>
                            <div><label>Bodega</label><input type="text" id="bodega" placeholder="Bodega"></div>
                            <div><label>Año</label><input type="number" id="ano" placeholder="2020"></div>
                        </div>
                    </div>
                    
                    <div class="card">
                        <div class="card-title">Ubicación en Bodega</div>
                        <div class="form-grid">
                            <div><label>Zona</label><select id="zona"><option>Cargar...</option></select></div>
                            <div><label>Columna</label><input type="number" id="columna" placeholder="1-30"></div>
                            <div><label>Fila</label><input type="number" id="fila" placeholder="1-20"></div>
                        </div>
                        <button onclick="registrar()">GUARDAR BOTELLA</button>
                    </div>
                    
                    <div class="section-title" style="margin-top: 35px;">Estadísticas</div>
                    <div class="stats">
                        <div class="stat-card"><div class="stat-value" id="total">0</div><div class="stat-label">Total</div></div>
                        <div class="stat-card"><div class="stat-value" id="disponibles">0</div><div class="stat-label">Disponibles</div></div>
                        <div class="stat-card"><div class="stat-value" id="ocupadas">0</div><div class="stat-label">Ocupadas</div></div>
                    </div>
                </div>
                
                <!-- INVENTARIO -->
                <div class="tab-content" id="tab-inventario">
                    <div class="section-title">Inventario</div>
                    <div class="card">
                        <table><thead><tr><th>Nombre</th><th>Tipo</th><th>Año</th><th>Bodega</th><th>Estado</th></tr></thead><tbody id="invTable"><tr><td colspan="5" style="text-align: center;">Cargando...</td></tr></tbody></table>
                    </div>
                </div>
                
                <!-- ADMIN -->
                <div class="tab-content" id="tab-admin">
                    <div class="section-title">Administración</div>
                    <div class="card">
                        <div class="card-title">Base de Datos</div>
                        <button onclick="inicializar()">INICIALIZAR BD</button>
                        <p id="msg" style="color: #d4a574; margin-top: 15px;"></p>
                    </div>
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
            if (tab === 'inventario') cargarInventario();
        }
        
        function cargarDatos() {
            fetch('/api/tipos').then(r => r.json()).then(d => {
                const sel = document.getElementById('tipo');
                sel.innerHTML = '<option>--Seleccionar--</option>';
                d.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.text = t.nombre; sel.appendChild(o); });
            });
            
            fetch('/api/paises').then(r => r.json()).then(d => {
                const sel = document.getElementById('pais');
                sel.innerHTML = '<option>--Seleccionar--</option>';
                d.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.text = p.nombre; sel.appendChild(o); });
            });
            
            fetch('/api/zonas').then(r => r.json()).then(d => {
                const sel = document.getElementById('zona');
                sel.innerHTML = '<option>--Seleccionar--</option>';
                d.forEach(z => { const o = document.createElement('option'); o.value = z.id; o.text = z.nombre; sel.appendChild(o); });
            });
            
            cargarEstadisticas();
        }
        
        function cargarEstadisticas() {
            fetch('/api/disponibilidad').then(r => r.json()).then(d => {
                document.getElementById('total').textContent = d.total || '0';
                document.getElementById('disponibles').textContent = d.disponibles || '0';
                document.getElementById('ocupadas').textContent = d.ocupadas || '0';
            });
        }
        
        function cargarInventario() {
            fetch('/api/inventario').then(r => r.json()).then(d => {
                const t = document.getElementById('invTable');
                t.innerHTML = d.map(v => '<tr><td>' + v.nombre + '</td><td>' + (v.tipo || '-') + '</td><td>' + v.ano + '</td><td>' + v.bodega + '</td><td>' + v.estado + '</td></tr>').join('') || '<tr><td colspan="5">Sin datos</td></tr>';
            });
        }
        
        function registrar() {
            const n = document.getElementById('nombre').value;
            const t = document.getElementById('tipo').value;
            const z = document.getElementById('zona').value;
            const c = document.getElementById('columna').value;
            const f = document.getElementById('fila').value;
            const p = document.getElementById('pais').value;
            const b = document.getElementById('bodega').value;
            const a = document.getElementById('ano').value;
            
            if (!n || !t || !z || !c || !f) { alert('Completa los campos'); return; }
            
            fetch('/api/registrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: n, tipo_id: parseInt(t), zona_id: parseInt(z), columna: parseInt(c), fila: parseInt(f), pais_id: p ? parseInt(p) : null, bodega: b, ano: a ? parseInt(a) : null })
            }).then(r => r.json()).then(d => {
                if (d.ok) { alert('Botella registrada: ' + d.codigo_qr); document.getElementById('nombre').value = ''; document.getElementById('ano').value = ''; cargarEstadisticas(); }
                else alert('Error: ' + d.error);
            });
        }
        
        function inicializar() {
            fetch('/setup').then(r => r.json()).then(d => {
                const msg = document.getElementById('msg');
                if (d.ok) { msg.textContent = '✓ BD inicializada correctamente'; setTimeout(cargarDatos, 1000); }
                else msg.textContent = '✗ Error: ' + d.error;
            });
        }
        
        cargarDatos();
        setInterval(cargarEstadisticas, 5000);
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Servidor en puerto ' + PORT));
