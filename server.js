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
        const check = await pool.query("SELECT * FROM information_schema.tables WHERE table_name='paises'");
        if (check.rows.length === 0) {
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

// ===== APIS =====
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises');
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
    try {
        const result = await pool.query('SELECT v.*, tv.nombre as tipo_nombre FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/registrar', async (req, res) => {
    const { nombre_vino, tipo_vino_id, zona_id, columna, fila, bodega, ano } = req.body;
    if (!nombre_vino || !tipo_vino_id || !zona_id || !columna || !fila) return res.json({ error: 'Datos requeridos' });
    
    try {
        const ubicRes = await pool.query('SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = TRUE', [zona_id, columna, fila]);
        if (ubicRes.rows.length === 0) return res.json({ error: 'Ubicación no disponible' });
        
        const codigo_qr = crypto.randomBytes(8).toString('hex');
        const vinRes = await pool.query(
            'INSERT INTO vinos (codigo_qr, nombre_vino, tipo_vino_id, bodega, ano, ubicacion_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [codigo_qr, nombre_vino, tipo_vino_id, bodega || 'Default', ano, ubicRes.rows[0].id]
        );
        
        await pool.query('UPDATE ubicaciones SET disponible = FALSE WHERE id = $1', [ubicRes.rows[0].id]);
        
        res.json({ ok: true, vino_id: vinRes.rows[0].id, codigo_qr });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bodegas</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Lora:wght@500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;width:100%}body{font-family:"Lora",serif;background:#08091a;color:#f5f5f5;display:flex;flex-direction:column;font-weight:500}.navbar{background:linear-gradient(135deg,rgba(212,165,116,.08) 0%,transparent 100%);border-bottom:2px solid rgba(212,165,116,.25);padding:18px 25px;display:flex;align-items:center;justify-content:space-between;min-height:75px;flex-wrap:wrap;gap:15px}.navbar-left{display:flex;align-items:center;gap:20px;flex:1;min-width:250px}.menu-toggle{display:none;background:0;border:2px solid #d4a574;color:#d4a574;font-size:1.3em;cursor:pointer;padding:8px 12px;border-radius:6px;font-weight:700;font-family:inherit}.menu-toggle:hover{background:rgba(212,165,116,.15)}.logo-navbar{font-family:"Playfair Display",serif;font-size:1.5em;color:#d4a574;font-weight:700;letter-spacing:2px}.search-bar{flex:1;min-width:200px;max-width:450px}.search-bar input{width:100%;background:rgba(255,255,255,.08);border:1.5px solid rgba(212,165,116,.3);color:#f5f5f5;padding:11px 14px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:500;transition:all .3s ease}.search-bar input:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.12);box-shadow:0 0 0 3px rgba(212,165,116,.15)}.search-bar input::placeholder{color:#999;font-weight:500}.navbar-right{display:flex;align-items:center;gap:12px}.filter-btn{background:0;border:1.5px solid #d4a574;color:#d4a574;padding:9px 16px;border-radius:6px;cursor:pointer;font-family:"Lora",serif;font-size:.8em;font-weight:600;text-transform:uppercase;letter-spacing:1px;transition:all .3s ease;white-space:nowrap}.filter-btn:hover{background:rgba(212,165,116,.12)}.user-avatar{width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.95em;cursor:pointer;flex-shrink:0}.container{display:flex;flex:1;overflow:hidden}.sidebar{width:240px;background:linear-gradient(180deg,rgba(212,165,116,.04) 0%,transparent 100%);border-right:1.5px solid rgba(212,165,116,.2);overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(212,165,116,.25) transparent}.sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-thumb{background:rgba(212,165,116,.25);border-radius:2px}.nav-item{padding:15px 20px;color:#a8a8a8;cursor:pointer;font-size:.9em;text-transform:uppercase;letter-spacing:1px;transition:all .3s ease;border-left:4px solid transparent;font-weight:600}.nav-item:hover{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.08)}.nav-item.active{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.12);font-weight:700}.main-content{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(212,165,116,.25) transparent;background:linear-gradient(135deg,#08091a 0%,#0a0d1f 100%)}.main-content::-webkit-scrollbar{width:6px}.main-content::-webkit-scrollbar-thumb{background:rgba(212,165,116,.25);border-radius:3px}.content-area{padding:40px}.section-title{font-family:"Playfair Display",serif;font-size:2.1em;color:#d4a574;margin-bottom:28px;font-weight:700;letter-spacing:1.5px}.card{background:rgba(212,165,116,.06);border:1.5px solid rgba(212,165,116,.2);border-radius:12px;padding:28px;margin-bottom:22px;transition:all .4s ease}.card:hover{background:rgba(212,165,116,.1);border-color:rgba(212,165,116,.35)}.card-title{font-size:.95em;color:#d4a574;margin-bottom:18px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px}input,select{background:rgba(255,255,255,.06);border:1.5px solid rgba(212,165,116,.25);color:#f5f5f5;padding:11px 13px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:500;transition:all .3s ease;width:100%}input:focus,select:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.1);box-shadow:0 0 0 3px rgba(212,165,116,.12)}input::placeholder{color:#888;font-weight:500}label{display:block;font-size:.8em;color:#b8b8b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.8px;font-weight:600}.form-group{margin-bottom:14px}button{background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);color:#000;border:0;padding:13px 30px;border-radius:6px;font-family:"Lora",serif;font-size:.9em;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:1px;transition:all .4s ease;margin-top:12px}.button:hover{transform:translateY(-2px);box-shadow:0 10px 30px rgba(212,165,116,.25)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:18px;margin:30px 0}.stat-card{background:rgba(212,165,116,.08);border:1.5px solid rgba(212,165,116,.2);border-radius:10px;padding:22px;text-align:center;transition:all .3s ease}.stat-card:hover{background:rgba(212,165,116,.12);border-color:rgba(212,165,116,.35)}.stat-value{font-family:"Playfair Display",serif;font-size:2em;color:#d4a574;margin-bottom:8px;font-weight:700}.stat-label{font-size:.8em;color:#a8a8a8;text-transform:uppercase;letter-spacing:.8px;font-weight:600}@media(max-width:768px){.navbar{padding:14px 15px;min-height:65px}.menu-toggle{display:inline-flex}.navbar-left{order:1;width:100%;min-width:unset}.search-bar{order:3;width:100%;min-width:unset;max-width:unset;margin-top:10px}.navbar-right{order:2;gap:8px}.logo-navbar{font-size:1.2em}.filter-btn{padding:7px 12px;font-size:.7em}.user-avatar{width:34px;height:34px;font-size:.85em}.sidebar{position:absolute;left:-240px;top:0;bottom:0;width:240px;height:100%;z-index:50;transition:left .3s ease;box-shadow:3px 0 15px rgba(0,0,0,.4)}.sidebar.active{left:0}.container{position:relative}.main-content{width:100%}.content-area{padding:25px 18px}.section-title{font-size:1.6em;margin-bottom:20px}.card{padding:20px;margin-bottom:15px}.card-grid{grid-template-columns:1fr}.stats-grid{grid-template-columns:repeat(2,1fr);gap:12px}.stat-card{padding:16px}.stat-value{font-size:1.5em}}@media(max-width:480px){.navbar{padding:12px 12px}.logo-navbar{font-size:1.05em;letter-spacing:1px}.filter-btn{display:none}.user-avatar{width:30px;height:30px;font-size:.75em}.content-area{padding:18px 12px}.section-title{font-size:1.3em;margin-bottom:15px}.card{padding:14px;margin-bottom:10px}.stats-grid{grid-template-columns:1fr}}</style></head><body><div class="navbar"><div class="navbar-left"><button class="menu-toggle" onclick="toggleSidebar()">☰</button><div class="logo-navbar">BODEGAS</div><div class="search-bar"><input type="text" id="searchInput" placeholder="Buscar vino..."></div></div><div class="navbar-right"><button class="filter-btn">⚙ Filtros</button><div class="user-avatar">AH</div></div></div><div class="container"><div class="sidebar" id="sidebar"><div class="nav-item active" onclick="switchTab(\'movimientos\',this)">Movimientos</div><div class="nav-item" onclick="switchTab(\'inventario\',this)">Inventario</div><div class="nav-item" onclick="switchTab(\'scanner\',this)">Scanner</div><div class="nav-item" onclick="switchTab(\'datos\',this)">Datos Maestros</div><div class="nav-item" onclick="switchTab(\'admin\',this)">Administración</div></div><div class="main-content"><div class="tab-content" id="tab-movimientos" style="display:block"><div class="content-area"><div class="section-title">Registrar Botellas</div><div class="card"><div class="card-title">Información del Vino</div><div class="card-grid"><div class="form-group"><label>Nombre</label><input type="text" id="nombre_vino" placeholder="Malbec Reserve"></div><div class="form-group"><label>Tipo</label><select id="tipo_vino_id"><option value="">Seleccionar tipo</option></select></div><div class="form-group"><label>Año</label><input type="number" id="ano" placeholder="2019"></div></div></div><div class="card"><div class="card-title">Ubicación en Bodega</div><div class="card-grid"><div class="form-group"><label>Zona</label><select id="zona_id"><option value="">Seleccionar zona</option><option value="1">A1</option><option value="2">A2</option><option value="3">B1</option><option value="4">B2</option><option value="5">C1</option><option value="6">C2</option><option value="7">D1</option><option value="8">D2</option></select></div><div class="form-group"><label>Fila (1-20)</label><input type="number" id="fila" min="1" max="20" placeholder="5"></div><div class="form-group"><label>Columna (1-30)</label><input type="number" id="columna" min="1" max="30" placeholder="12"></div></div><button onclick="registrarBotella()">GUARDAR BOTELLA</button></div><div class="section-title" style="margin-top:35px">Estadísticas</div><div class="stats-grid"><div class="stat-card"><div class="stat-value" id="totalStats">-</div><div class="stat-label">Total</div></div><div class="stat-card"><div class="stat-value" id="dispStats">-</div><div class="stat-label">Disponibles</div></div><div class="stat-card"><div class="stat-value" id="ocupStats">-</div><div class="stat-label">Ocupadas</div></div></div></div></div><div class="tab-content" id="tab-inventario" style="display:none"><div class="content-area"><div class="section-title">Inventario</div><p style="color:#999;margin:25px 0;font-weight:500">Botellas registradas: Sin datos aún</p></div></div><div class="tab-content" id="tab-scanner" style="display:none"><div class="content-area"><div class="section-title">Scanner QR</div><div class="card"><div class="card-title">Escanear Código</div><p style="color:#999;margin:15px 0;font-weight:500">Funcionalidad en desarrollo</p></div></div></div><div class="tab-content" id="tab-datos" style="display:none"><div class="content-area"><div class="section-title">Datos Maestros</div><p style="color:#999;margin:25px 0;font-weight:500">Gestión de datos en desarrollo</p></div></div><div class="tab-content" id="tab-admin" style="display:none"><div class="content-area"><div class="section-title">Administración</div><p style="color:#999;margin:25px 0;font-weight:500">Herramientas administrativas en desarrollo</p></div></div></div></div></div><script>function toggleSidebar(){document.getElementById("sidebar").classList.toggle("active")}function switchTab(tabName,elem){document.querySelectorAll(".tab-content").forEach(t=>t.style.display="none");document.getElementById("tab-"+tabName).style.display="block";document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));elem.classList.add("active");if(window.innerWidth<=768)document.getElementById("sidebar").classList.remove("active")}function cargarEstadisticas(){fetch("/api/disponibilidad").then(r=>r.json()).then(d=>{if(!d.error){document.getElementById("totalStats").textContent=d.total.toLocaleString();document.getElementById("dispStats").textContent=d.disponibles.toLocaleString();document.getElementById("ocupStats").textContent=d.ocupadas.toLocaleString()}})}function registrarBotella(){const nombre=document.getElementById("nombre_vino").value;const tipo=document.getElementById("tipo_vino_id").value;const ano=document.getElementById("ano").value;const zona=document.getElementById("zona_id").value;const fila=document.getElementById("fila").value;const columna=document.getElementById("columna").value;if(!nombre||!tipo||!ano||!zona||!fila||!columna){alert("Completa todos los campos");return}fetch("/api/registrar",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre_vino:nombre,tipo_vino_id:parseInt(tipo),ano:parseInt(ano),zona_id:parseInt(zona),fila:parseInt(fila),columna:parseInt(columna),bodega:"Default"})}).then(r=>r.json()).then(d=>{if(d.ok){alert("Botella registrada: "+d.codigo_qr);document.getElementById("nombre_vino").value="";document.getElementById("ano").value="";cargarEstadisticas()}else{alert("Error: "+(d.error||"Desconocido"))}})}fetch("/api/tipos").then(r=>r.json()).then(tipos=>{const select=document.getElementById("tipo_vino_id");tipos.forEach(t=>{const opt=document.createElement("option");opt.value=t.id;opt.textContent=t.nombre;select.appendChild(opt)})});cargarEstadisticas();setInterval(cargarEstadisticas,5000)</script></body></html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
