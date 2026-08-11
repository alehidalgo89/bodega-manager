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

// AUTO-INIT BD
async function initDB() {
    try {
        const check = await pool.query("SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='paises')");
        if (!check.rows[0].exists) {
            console.log('Inicializando BD...');
            
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
            await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
            await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
            await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE, columnas INT, filas INT)');
            await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE, columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))');
            await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(100) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(100), ano INT, ubicacion_id INTEGER REFERENCES ubicaciones(id), estado VARCHAR(50) DEFAULT "activa", fecha_ingreso TIMESTAMP DEFAULT NOW())');
            await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, variedad_id INTEGER REFERENCES variedades(id) ON DELETE CASCADE)');
            await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(50), fecha TIMESTAMP DEFAULT NOW())');
            
            await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2), ($3, $4), ($5, $6)', ['Argentina', 'AR', 'Chile', 'CL', 'España', 'ES']);
            const paisArg = await pool.query('SELECT id FROM paises WHERE codigo_iso = $1', ['AR']);
            await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2), ($1, $3)', [paisArg.rows[0].id, 'Mendoza', 'Salta']);
            await pool.query('INSERT INTO tipos_vino (nombre) VALUES ($1), ($2), ($3)', ['Tinto', 'Blanco', 'Rosado']);
            await pool.query('INSERT INTO variedades (nombre) VALUES ($1), ($2), ($3), ($4)', ['Malbec', 'Cabernet Sauvignon', 'Chardonnay', 'Syrah']);
            
            const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
            for (const zona of zonas) {
                const cols = zona.startsWith('A') || zona.startsWith('D') ? 20 : 30;
                const zoneRes = await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES ($1, $2, $3) RETURNING id', [zona, cols, 20]);
                const zoneId = zoneRes.rows[0].id;
                for (let col = 1; col <= cols; col++) {
                    for (let fila = 1; fila <= 20; fila++) {
                        await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila, disponible) VALUES ($1, $2, $3, TRUE)', [zoneId, col, fila]);
                    }
                }
            }
            console.log('BD inicializada correctamente');
        }
    } catch (err) {
        console.error('Error al inicializar BD:', err.message);
    }
}

initDB();

// ===== 15 ENDPOINTS =====
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/regiones/:paisId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM regiones WHERE pais_id = $1', [req.params.paisId]);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/tipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/variedades', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM variedades');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/ocupadas', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as ocupadas FROM ubicaciones WHERE disponible = FALSE');
        res.json({ ocupadas: parseInt(result.rows[0].ocupadas) });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/disponibilidad', async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) as total FROM ubicaciones');
        const disponibles = await pool.query('SELECT COUNT(*) as disp FROM ubicaciones WHERE disponible = TRUE');
        res.json({ 
            total: parseInt(total.rows[0].total), 
            disponibles: parseInt(disponibles.rows[0].disp),
            ocupadas: parseInt(total.rows[0].total) - parseInt(disponibles.rows[0].disp)
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/buscar', async (req, res) => {
    const { nombre, tipo, bodega, ano } = req.query;
    try {
        let query = 'SELECT v.*, tv.nombre as tipo_nombre, p.nombre as pais_nombre, r.nombre as region_nombre FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN paises p ON v.pais_id = p.id LEFT JOIN regiones r ON v.region_id = r.id WHERE 1=1';
        const params = [];
        
        if (nombre) { query += ' AND v.nombre_vino ILIKE $' + (params.length + 1); params.push('%' + nombre + '%'); }
        if (tipo) { query += ' AND tv.nombre = $' + (params.length + 1); params.push(tipo); }
        if (bodega) { query += ' AND v.bodega ILIKE $' + (params.length + 1); params.push('%' + bodega + '%'); }
        if (ano) { query += ' AND v.ano = $' + (params.length + 1); params.push(ano); }
        
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/vinos/qr/:code', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM vinos WHERE codigo_qr = $1', [req.params.code]);
        res.json(result.rows[0] || { error: 'No encontrado' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/registrar', async (req, res) => {
    const { nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, zona_id, columna, fila } = req.body;
    if (!nombre_vino || !tipo_vino_id || !zona_id || !columna || !fila) return res.json({ error: 'Datos requeridos' });
    
    try {
        const ubicRes = await pool.query('SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = TRUE', [zona_id, columna, fila]);
        if (ubicRes.rows.length === 0) return res.json({ error: 'Ubicación no disponible' });
        
        const codigo_qr = crypto.randomBytes(8).toString('hex');
        const vinRes = await pool.query(
            'INSERT INTO vinos (codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
            [codigo_qr, nombre_vino, tipo_vino_id, pais_id || null, region_id || null, bodega, ano, ubicRes.rows[0].id]
        );
        
        await pool.query('UPDATE ubicaciones SET disponible = FALSE WHERE id = $1', [ubicRes.rows[0].id]);
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/movimiento/:vinoId', async (req, res) => {
    const { tipo_movimiento } = req.body;
    if (!tipo_movimiento) return res.json({ error: 'Tipo requerido' });
    
    try {
        await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento) VALUES ($1, $2)', [req.params.vinoId, tipo_movimiento]);
        res.json({ ok: true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/agregar-pais', async (req, res) => {
    const { nombre, codigo_iso } = req.body;
    if (!nombre) return res.json({ error: 'Nombre requerido' });
    
    try {
        const result = await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2) RETURNING *', [nombre, codigo_iso || null]);
        res.json({ ok: true, pais: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'País ya existe' : err.message });
    }
});

app.post('/api/agregar-variedad', async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.json({ error: 'Nombre requerido' });
    
    try {
        const result = await pool.query('INSERT INTO variedades (nombre) VALUES ($1) RETURNING *', [nombre]);
        res.json({ ok: true, variedad: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'Variedad ya existe' : err.message });
    }
});

app.post('/api/agregar-region', async (req, res) => {
    const { pais_id, nombre } = req.body;
    if (!pais_id || !nombre) return res.json({ error: 'País y nombre requeridos' });
    
    try {
        const result = await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2) RETURNING *', [pais_id, nombre]);
        res.json({ ok: true, region: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'La región ya existe' : err.message });
    }
});

// ===== MAIN APP =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bodegas</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;width:100%}body{font-family:"Lora",serif;background:#08091a;color:#f5f5f5;display:flex;flex-direction:column;font-weight:500}.navbar{background:linear-gradient(135deg,rgba(212,165,116,.08) 0%,transparent 100%);border-bottom:2px solid rgba(212,165,116,.25);padding:18px 25px;display:flex;align-items:center;justify-content:space-between;min-height:75px;flex-wrap:wrap;gap:15px}.navbar-left{display:flex;align-items:center;gap:20px;flex:1;min-width:250px}.menu-toggle{display:none;background:0;border:2px solid #d4a574;color:#d4a574;font-size:1.3em;cursor:pointer;padding:8px 12px;border-radius:6px;font-weight:700;font-family:inherit}.menu-toggle:hover{background:rgba(212,165,116,.15)}.logo-navbar{font-family:"Playfair Display",serif;font-size:1.5em;color:#d4a574;font-weight:700;letter-spacing:2px}.search-bar{flex:1;min-width:200px;max-width:450px}.search-bar input{width:100%;background:rgba(255,255,255,.08);border:1.5px solid rgba(212,165,116,.3);color:#f5f5f5;padding:11px 14px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:500;transition:all .3s ease}.search-bar input:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.12);box-shadow:0 0 0 3px rgba(212,165,116,.15)}.search-bar input::placeholder{color:#999;font-weight:500}.navbar-right{display:flex;align-items:center;gap:12px}.filter-btn{background:0;border:1.5px solid #d4a574;color:#d4a574;padding:9px 16px;border-radius:6px;cursor:pointer;font-family:"Lora",serif;font-size:.8em;font-weight:600;text-transform:uppercase;letter-spacing:1px;transition:all .3s ease}.filter-btn:hover{background:rgba(212,165,116,.12)}.user-avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95em;cursor:pointer;flex-shrink:0}.container{display:flex;flex:1;overflow:hidden}.sidebar{width:240px;background:linear-gradient(180deg,rgba(212,165,116,.04) 0%,transparent 100%);border-right:1.5px solid rgba(212,165,116,.2);overflow-y:auto}.sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-thumb{background:rgba(212,165,116,.25)}.nav-item{padding:15px 20px;color:#a8a8a8;cursor:pointer;font-size:.9em;text-transform:uppercase;letter-spacing:1px;transition:all .3s ease;border-left:4px solid transparent;font-weight:600}.nav-item:hover{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.08)}.nav-item.active{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.12);font-weight:700}.main-content{flex:1;overflow-y:auto;background:linear-gradient(135deg,#08091a 0%,#0a0d1f 100%)}.main-content::-webkit-scrollbar{width:6px}.main-content::-webkit-scrollbar-thumb{background:rgba(212,165,116,.25)}.content-area{padding:40px}.section-title{font-family:"Playfair Display",serif;font-size:2.1em;color:#d4a574;margin-bottom:28px;font-weight:700;letter-spacing:1.5px}.card{background:rgba(212,165,116,.06);border:1.5px solid rgba(212,165,116,.2);border-radius:12px;padding:28px;margin-bottom:22px;transition:all .4s ease}.card:hover{background:rgba(212,165,116,.1);border-color:rgba(212,165,116,.35)}.card-title{font-size:.95em;color:#d4a574;margin-bottom:18px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px}input,select{background:rgba(255,255,255,.06);border:1.5px solid rgba(212,165,116,.25);color:#f5f5f5;padding:11px 13px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:500;transition:all .3s ease;width:100%}input:focus,select:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.1);box-shadow:0 0 0 3px rgba(212,165,116,.12)}input::placeholder{color:#888}label{display:block;font-size:.8em;color:#b8b8b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;font-weight:600}.form-group{margin-bottom:14px}button{background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);color:#000;border:0;padding:13px 30px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:1px;transition:all .4s ease;margin-top:12px}button:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(212,165,116,.25)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:18px;margin:30px 0}.stat-card{background:rgba(212,165,116,.08);border:1.5px solid rgba(212,165,116,.2);border-radius:10px;padding:22px;text-align:center}.stat-value{font-family:"Playfair Display",serif;font-size:2em;color:#d4a574;margin-bottom:8px;font-weight:700}.stat-label{font-size:.8em;color:#a8a8a8;text-transform:uppercase;letter-spacing:.8px;font-weight:600}.table-container{overflow-x:auto;margin-top:20px}table{width:100%;border-collapse:collapse;font-size:.85em}thead{border-bottom:2px solid #d4a574}th{padding:12px 10px;text-align:left;color:#d4a574;font-weight:700;text-transform:uppercase;letter-spacing:.8px;font-size:.75em}td{padding:12px 10px;border-bottom:1px solid rgba(212,165,116,.1);color:#a8a8a8}tr:hover{background:rgba(212,165,116,.05)}@media(max-width:768px){.navbar{padding:14px 15px;min-height:65px}.menu-toggle{display:inline-flex}.navbar-left{order:1;width:100%;min-width:unset}.search-bar{order:3;width:100%;min-width:unset;max-width:unset;margin-top:10px}.sidebar{position:absolute;left:-240px;top:0;bottom:0;width:240px;z-index:50;transition:left .3s ease}.sidebar.active{left:0}.container{position:relative}.main-content{width:100%}.content-area{padding:25px 18px}.section-title{font-size:1.6em;margin-bottom:20px}.card{padding:20px;margin-bottom:15px}.stats-grid{grid-template-columns:repeat(2,1fr);gap:12px}}.stat-card{padding:16px}}@media(max-width:480px){.navbar{padding:12px 12px}.logo-navbar{font-size:1.05em}.filter-btn{display:none}.content-area{padding:18px 12px}.section-title{font-size:1.3em;margin-bottom:15px}.card{padding:14px;margin-bottom:10px}}</style></head><body><div class="navbar"><div class="navbar-left"><button class="menu-toggle" onclick="toggleSidebar()">☰</button><div class="logo-navbar">BODEGAS</div><div class="search-bar"><input type="text" placeholder="Buscar..."></div></div><div class="navbar-right"><button class="filter-btn">⚙ FILTROS</button><div class="user-avatar">AH</div></div></div><div class="container"><div class="sidebar" id="sidebar"><div class="nav-item active" onclick="switchTab(\'movimientos\',this)">MOVIMIENTOS</div><div class="nav-item" onclick="switchTab(\'inventario\',this)">INVENTARIO</div><div class="nav-item" onclick="switchTab(\'scanner\',this)">SCANNER</div><div class="nav-item" onclick="switchTab(\'datos\',this)">DATOS MAESTROS</div><div class="nav-item" onclick="switchTab(\'admin\',this)">ADMINISTRACIÓN</div></div><div class="main-content"><div class="tab-content" id="tab-movimientos" style="display:block"><div class="content-area"><div class="section-title">Registrar Botellas</div><div class="card"><div class="card-title">Información del Vino</div><div class="card-grid"><div class="form-group"><label>Nombre</label><input type="text" id="nombre_vino" placeholder="Malbec Reserve"></div><div class="form-group"><label>Tipo</label><select id="tipo_vino_id"><option value="">Seleccionar</option></select></div><div class="form-group"><label>Año</label><input type="number" id="ano" placeholder="2019"></div></div></div><div class="card"><div class="card-title">Ubicación en Bodega</div><div class="card-grid"><div class="form-group"><label>Zona</label><select id="zona_id"><option value="">Seleccionar</option><option value="1">A1</option><option value="2">A2</option><option value="3">B1</option><option value="4">B2</option><option value="5">C1</option><option value="6">C2</option><option value="7">D1</option><option value="8">D2</option></select></div><div class="form-group"><label>Fila</label><input type="number" id="fila" placeholder="1"></div><div class="form-group"><label>Columna</label><input type="number" id="columna" placeholder="1"></div></div><button onclick="registrarBotella()">GUARDAR BOTELLA</button></div><div class="section-title" style="margin-top:35px">Estadísticas</div><div class="stats-grid"><div class="stat-card"><div class="stat-value" id="totalStats">-</div><div class="stat-label">TOTAL</div></div><div class="stat-card"><div class="stat-value" id="dispStats">-</div><div class="stat-label">DISPONIBLES</div></div><div class="stat-card"><div class="stat-value" id="ocupStats">-</div><div class="stat-label">OCUPADAS</div></div></div></div></div><div class="tab-content" id="tab-inventario" style="display:none"><div class="content-area"><div class="section-title">Inventario</div><div class="table-container"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Año</th><th>Bodega</th><th>Estado</th></tr></thead><tbody id="vinosTableBody"><tr><td colspan="5" style="text-align:center">Cargando...</td></tr></tbody></table></div></div></div><div class="tab-content" id="tab-scanner" style="display:none"><div class="content-area"><div class="section-title">Scanner QR</div><div class="card"><p style="color:#999;font-weight:500">En desarrollo</p></div></div></div><div class="tab-content" id="tab-datos" style="display:none"><div class="content-area"><div class="section-title">Datos Maestros</div><div class="card"><div class="card-title">Agregar País</div><div class="card-grid"><div class="form-group"><label>Nombre</label><input type="text" id="nombrePais" placeholder="Portugal"></div><div class="form-group"><label>Código ISO</label><input type="text" id="codigoISO" placeholder="PT"></div></div><button onclick="agregarPais()">AGREGAR PAÍS</button></div></div></div><div class="tab-content" id="tab-admin" style="display:none"><div class="content-area"><div class="section-title">Administración</div><p style="color:#999;font-weight:500">En desarrollo</p></div></div></div></div></div><script>function toggleSidebar(){document.getElementById("sidebar").classList.toggle("active")}function switchTab(t,e){document.querySelectorAll(".tab-content").forEach(e=>e.style.display="none"),document.getElementById("tab-"+t).style.display="block",document.querySelectorAll(".nav-item").forEach(e=>e.classList.remove("active")),e.classList.add("active"),window.innerWidth<=768&&document.getElementById("sidebar").classList.remove("active"),"inventario"===t&&cargarInventario(),"movimientos"===t&&cargarEstadisticas()}function cargarEstadisticas(){fetch("/api/disponibilidad").then(e=>e.json()).then(e=>{e.error||( document.getElementById("totalStats").textContent=e.total.toLocaleString(),document.getElementById("dispStats").textContent=e.disponibles.toLocaleString(),document.getElementById("ocupStats").textContent=e.ocupadas.toLocaleString())})}function cargarInventario(){fetch("/api/buscar").then(e=>e.json()).then(e=>{const t=document.getElementById("vinosTableBody");t.innerHTML=e.slice(0,10).map(e=>"<tr><td>"+(e.nombre_vino||"-")+"</td><td>"+(e.tipo_nombre||"-")+"</td><td>"+(e.ano||"-")+"</td><td>"+(e.bodega||"-")+"</td><td>"+(e.estado||"activa")+"</td></tr>").join("")||'<tr><td colspan="5" style="text-align:center">Sin datos</td></tr>'})}function registrarBotella(){fetch("/api/registrar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre_vino:document.getElementById("nombre_vino").value,tipo_vino_id:parseInt(document.getElementById("tipo_vino_id").value),ano:parseInt(document.getElementById("ano").value),zona_id:parseInt(document.getElementById("zona_id").value),fila:parseInt(document.getElementById("fila").value),columna:parseInt(document.getElementById("columna").value),bodega:"Default"})}).then(e=>e.json()).then(e=>{e.ok?(alert("Botella registrada: "+e.codigo_qr),document.getElementById("nombre_vino").value="",document.getElementById("ano").value="",cargarEstadisticas()):alert("Error: "+(e.error||"Desconocido"))})}function agregarPais(){fetch("/api/agregar-pais",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre:document.getElementById("nombrePais").value,codigo_iso:document.getElementById("codigoISO").value})}).then(e=>e.json()).then(e=>{e.ok?(alert("País agregado"),document.getElementById("nombrePais").value="",document.getElementById("codigoISO").value=""):alert("Error: "+e.error)})}fetch("/api/tipos").then(e=>e.json()).then(e=>{const t=document.getElementById("tipo_vino_id");e.forEach(e=>{const o=document.createElement("option");o.value=e.id,o.textContent=e.nombre,t.appendChild(o)})}),cargarEstadisticas(),setInterval(cargarEstadisticas,5e3)</script></body></html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
