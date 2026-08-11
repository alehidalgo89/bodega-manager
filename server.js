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

// AUTO-INIT BD AL ARRANCAR
async function initDB() {
    try {
        const tableExists = await pool.query("SELECT * FROM information_schema.tables WHERE table_name='paises'");
        if (tableExists.rows.length === 0) {
            console.log('Inicializando BD...');
            await pool.query('CREATE TABLE IF NOT EXISTS paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
            await pool.query('CREATE TABLE IF NOT EXISTS tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
            await pool.query('CREATE TABLE IF NOT EXISTS zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
            await pool.query('CREATE TABLE IF NOT EXISTS ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
            
            await pool.query('INSERT INTO paises (nombre) VALUES ($1), ($2), ($3)', ['Argentina', 'Chile', 'España']);
            await pool.query('INSERT INTO tipos_vino (nombre) VALUES ($1), ($2), ($3)', ['Tinto', 'Blanco', 'Rosado']);
            
            const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
            for (const zona of zonas) {
                const zoneRes = await pool.query('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [zona]);
                const zoneId = zoneRes.rows[0].id;
                for (let col = 1; col <= 20; col++) {
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

// APIS
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

app.get('/api/tipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/buscar', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ubicaciones LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// MAIN APP
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Bodegas</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{height:100%;width:100%}body{font-family:"Lora",serif;background:#08091a;color:#f5f5f5;display:flex;flex-direction:column}.navbar{background:linear-gradient(135deg,rgba(212,165,116,.05) 0%,transparent 100%);border-bottom:1px solid rgba(212,165,116,.15);padding:15px 20px;display:flex;align-items:center;justify-content:space-between;min-height:70px;flex-wrap:wrap;gap:15px}.navbar-left{display:flex;align-items:center;gap:15px;flex:1;min-width:250px}.menu-toggle{display:none;background:0;border:1px solid rgba(212,165,116,.3);color:#d4a574;font-size:1.2em;cursor:pointer;padding:8px 12px;border-radius:6px;transition:all .3s ease;font-family:inherit}.menu-toggle:hover{background:rgba(212,165,116,.1)}.logo-navbar{font-family:"Playfair Display",serif;font-size:1.3em;color:#d4a574;font-weight:400;letter-spacing:1px;white-space:nowrap}.search-bar{flex:1;min-width:200px;max-width:400px}.search-bar input{width:100%;background:rgba(255,255,255,.08);border:1px solid rgba(212,165,116,.2);color:#f5f5f5;padding:9px 12px;border-radius:6px;font-family:"Lora",serif;font-size:.85em;transition:all .3s ease}.search-bar input:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.08);box-shadow:0 0 0 3px rgba(212,165,116,.1)}.navbar-right{display:flex;align-items:center;gap:12px}.filter-btn{background:0;border:1px solid rgba(212,165,116,.3);color:#a8a8a8;padding:8px 12px;border-radius:6px;cursor:pointer;font-family:"Lora",serif;font-size:.75em;text-transform:uppercase;letter-spacing:.8px;transition:all .3s ease;white-space:nowrap}.filter-btn:hover{border-color:#d4a574;color:#d4a574;background:rgba(212,165,116,.08)}.user-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.9em;cursor:pointer;flex-shrink:0}.container{display:flex;flex:1;overflow:hidden}.sidebar{width:220px;background:linear-gradient(180deg,rgba(212,165,116,.03) 0%,transparent 100%);border-right:1px solid rgba(212,165,116,.15);overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(212,165,116,.2) transparent}.sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-track{background:0}.sidebar::-webkit-scrollbar-thumb{background:rgba(212,165,116,.2);border-radius:2px}.nav-item{padding:14px 18px;color:#888;cursor:pointer;font-size:.85em;text-transform:uppercase;letter-spacing:.8px;transition:all .3s ease;border-left:3px solid transparent;font-weight:500}.nav-item:hover{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.05)}.nav-item.active{color:#d4a574;border-left-color:#d4a574;background:rgba(212,165,116,.08)}.main-content{flex:1;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(212,165,116,.2) transparent;background:linear-gradient(135deg,#08091a 0%,#0a0d1f 100%)}.main-content::-webkit-scrollbar{width:6px}.main-content::-webkit-scrollbar-track{background:0}.main-content::-webkit-scrollbar-thumb{background:rgba(212,165,116,.2);border-radius:3px}.content-area{padding:35px}.section-title{font-family:"Playfair Display",serif;font-size:1.8em;color:#d4a574;margin-bottom:25px;font-weight:400;letter-spacing:1px}.card{background:rgba(212,165,116,.05);border:1px solid rgba(212,165,116,.15);border-radius:12px;padding:25px;margin-bottom:20px;transition:all .4s ease}.card:hover{background:rgba(212,165,116,.08);border-color:rgba(212,165,116,.25)}.card-title{font-size:.85em;color:#d4a574;margin-bottom:15px;text-transform:uppercase;letter-spacing:1px;font-weight:500}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:15px}input,select{background:rgba(255,255,255,.05);border:1px solid rgba(212,165,116,.2);color:#f5f5f5;padding:10px 12px;border-radius:6px;font-family:"Lora",serif;font-size:.85em;transition:all .3s ease;width:100%}input:focus,select:focus{outline:0;border-color:#d4a574;background:rgba(212,165,116,.08);box-shadow:0 0 0 3px rgba(212,165,116,.1)}label{display:block;font-size:.75em;color:#a8a8a8;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}.form-group{margin-bottom:12px}button{background:linear-gradient(135deg,#d4a574 0%,#a05a5a 100%);color:#000;border:0;padding:11px 28px;border-radius:6px;font-family:"Lora",serif;font-size:.85em;font-weight:500;cursor:pointer;text-transform:uppercase;letter-spacing:.8px;transition:all .4s ease;margin-top:10px}button:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(212,165,116,.2)}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:15px;margin:25px 0}.stat-card{background:rgba(212,165,116,.08);border:1px solid rgba(212,165,116,.15);border-radius:8px;padding:18px;text-align:center}.stat-value{font-family:"Playfair Display",serif;font-size:1.8em;color:#d4a574;margin-bottom:6px;font-weight:400}.stat-label{font-size:.75em;color:#888;text-transform:uppercase;letter-spacing:.5px}@media(max-width:768px){.navbar{padding:12px 15px;min-height:60px}.menu-toggle{display:inline-flex}.navbar-left{order:1;width:100%;min-width:unset}.search-bar{order:3;width:100%;min-width:unset;max-width:unset;margin-top:10px}.navbar-right{order:2;gap:8px}.logo-navbar{font-size:1.1em}.filter-btn{padding:6px 10px;font-size:.7em}.user-avatar{width:32px;height:32px;font-size:.8em}.sidebar{position:absolute;left:-220px;top:0;bottom:0;width:220px;height:100%;z-index:50;transition:left .3s ease;box-shadow:2px 0 10px rgba(0,0,0,.3)}.sidebar.active{left:0}.container{position:relative}.main-content{width:100%}.content-area{padding:20px 15px}.section-title{font-size:1.4em;margin-bottom:18px}.card{padding:18px;margin-bottom:15px}.card-grid{grid-template-columns:1fr}.stats-grid{grid-template-columns:repeat(2,1fr);gap:12px}.stat-card{padding:14px}.stat-value{font-size:1.5em}}@media(max-width:480px){.navbar{padding:10px 12px}.logo-navbar{font-size:1em}.filter-btn{display:none}.user-avatar{width:28px;height:28px;font-size:.7em}.content-area{padding:15px 12px}.section-title{font-size:1.2em;margin-bottom:15px}.card{padding:14px;margin-bottom:12px}.stats-grid{grid-template-columns:1fr}}</style></head><body><div class="navbar"><div class="navbar-left"><button class="menu-toggle" onclick="toggleSidebar()">☰</button><div class="logo-navbar">Bodegas</div><div class="search-bar"><input type="text" id="searchInput" placeholder="Buscar vino..."></div></div><div class="navbar-right"><button class="filter-btn">⚙ Filtros</button><div class="user-avatar">AH</div></div></div><div class="container"><div class="sidebar" id="sidebar"><div class="nav-item active" onclick="switchTab(\'movimientos\',this)">Movimientos</div><div class="nav-item" onclick="switchTab(\'inventario\',this)">Inventario</div><div class="nav-item" onclick="switchTab(\'scanner\',this)">Scanner</div><div class="nav-item" onclick="switchTab(\'datos\',this)">Datos Maestros</div><div class="nav-item" onclick="switchTab(\'admin\',this)">Administración</div></div><div class="main-content"><div class="tab-content" id="tab-movimientos" style="display:block"><div class="content-area"><div class="section-title">Registrar Botellas</div><div class="card"><div class="card-title">Información del Vino</div><div class="card-grid"><div class="form-group"><label>Nombre</label><input type="text" id="nombre_vino" placeholder="Malbec Reserve"></div><div class="form-group"><label>Tipo</label><select id="tipo_vino_id"><option value="">Seleccionar</option></select></div><div class="form-group"><label>Año</label><input type="number" id="ano" placeholder="2019"></div></div></div><div class="card"><div class="card-title">Ubicación en Bodega</div><div class="card-grid"><div class="form-group"><label>Zona</label><select id="zona_id"><option value="">Seleccionar</option><option value="1">A1</option><option value="2">A2</option><option value="3">B1</option><option value="4">B2</option><option value="5">C1</option><option value="6">C2</option><option value="7">D1</option><option value="8">D2</option></select></div><div class="form-group"><label>Fila</label><input type="number" id="fila" placeholder="1-20"></div><div class="form-group"><label>Columna</label><input type="number" id="columna" placeholder="1-30"></div></div><button onclick="registrarBotella()">Guardar Botella</button></div><div class="section-title" style="margin-top:30px">Estadísticas</div><div class="stats-grid"><div class="stat-card"><div class="stat-value" id="totalStats">-</div><div class="stat-label">Total</div></div><div class="stat-card"><div class="stat-value" id="dispStats">-</div><div class="stat-label">Disponibles</div></div><div class="stat-card"><div class="stat-value" id="ocupStats">-</div><div class="stat-label">Ocupadas</div></div></div></div></div><div class="tab-content" id="tab-inventario" style="display:none"><div class="content-area"><div class="section-title">Inventario</div><p style="color:#888;padding:20px">Sin datos aún. Comienza registrando botellas en la sección Movimientos.</p></div></div><div class="tab-content" id="tab-scanner" style="display:none"><div class="content-area"><div class="section-title">Scanner QR</div><div class="card"><div class="card-title">Funcionalidad próximamente</div><p style="color:#888">Scanner QR en desarrollo.</p></div></div></div><div class="tab-content" id="tab-datos" style="display:none"><div class="content-area"><div class="section-title">Datos Maestros</div><div class="card"><div class="card-title">Funcionalidad próximamente</div><p style="color:#888">Gestión de datos en desarrollo.</p></div></div></div><div class="tab-content" id="tab-admin" style="display:none"><div class="content-area"><div class="section-title">Administración</div><div class="card"><div class="card-title">Funcionalidad próximamente</div><p style="color:#888">Administración en desarrollo.</p></div></div></div></div></div></div><script>function toggleSidebar(){document.getElementById("sidebar").classList.toggle("active")}function switchTab(tabName,elem){document.querySelectorAll(".tab-content").forEach(t=>t.style.display="none");document.getElementById("tab-"+tabName).style.display="block";document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));elem.classList.add("active");if(window.innerWidth<=768)document.getElementById("sidebar").classList.remove("active")}function cargarEstadisticas(){fetch("/api/disponibilidad").then(r=>r.json()).then(d=>{if(!d.error){document.getElementById("totalStats").textContent=d.total.toLocaleString();document.getElementById("dispStats").textContent=d.disponibles.toLocaleString();document.getElementById("ocupStats").textContent=d.ocupadas.toLocaleString()}})}function registrarBotella(){alert("Funcionalidad en desarrollo")}fetch("/api/tipos").then(r=>r.json()).then(tipos=>{const select=document.getElementById("tipo_vino_id");tipos.forEach(t=>{const opt=document.createElement("option");opt.value=t.id;opt.textContent=t.nombre;select.appendChild(opt)})});cargarEstadisticas();setInterval(cargarEstadisticas,5000)</script></body></html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
