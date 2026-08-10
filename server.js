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

// ===== SETUP =====
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
        await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(5) NOT NULL UNIQUE, columnas INTEGER, filas INTEGER)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id), columna INTEGER, fila INTEGER, disponible BOOLEAN DEFAULT TRUE)');
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150), ano INTEGER, ubicacion_id INTEGER REFERENCES ubicaciones(id), estado VARCHAR(20) DEFAULT "Disponible", fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id), variedad_id INTEGER REFERENCES variedades(id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id), tipo_movimiento VARCHAR(50), razon TEXT, fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

        // Insert tipos
        await pool.query('INSERT INTO tipos_vino (nombre) VALUES (\'Tinto\'),(\'Blanco\'),(\'Rosado\'),(\'Espumante\'),(\'Champagne\')');
        
        // Insert variedades
        const vars = ['Chardonnay','Pinot Noir','Merlot','Cabernet Sauvignon','Syrah','Riesling','Sauvignon Blanc','Tempranillo','Babić','Plavac Mali','Garnacha','Malbec','Tannat','Shiraz','Prosecco'];
        for (const v of vars) {
            await pool.query('INSERT INTO variedades (nombre) VALUES ($1) ON CONFLICT DO NOTHING', [v]);
        }
        
        // Insert paises
        const paises = [['Francia','FR'],['Italia','IT'],['España','ES'],['Argentina','AR'],['Chile','CL'],['Australia','AU'],['Croacia','HR'],['Portugal','PT'],['Alemania','DE'],['USA','US']];
        for (const [n,c] of paises) {
            await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2)', [n, c]);
        }
        
        // Insert regiones
        const regiones = {
            'Francia': ['Champagne','Bordeaux','Rhône'],
            'Italia': ['Toscana','Piamonte'],
            'España': ['Rioja','Ribera del Duero'],
            'Argentina': ['Mendoza'],
            'Chile': ['Maule','Casablanca'],
            'Australia': ['Barossa Valley'],
            'Croacia': ['Dalmacia'],
            'Portugal': ['Douro'],
            'Alemania': ['Mosel'],
            'USA': ['Napa Valley']
        };
        for (const [pais, regs] of Object.entries(regiones)) {
            const pres = await pool.query('SELECT id FROM paises WHERE nombre = $1', [pais]);
            if (pres.rows.length > 0) {
                for (const r of regs) {
                    await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2)', [pres.rows[0].id, r]);
                }
            }
        }
        
        // Insert zonas
        await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES (\'A1\',20,20),(\'A2\',20,20),(\'B1\',30,20),(\'B2\',30,20),(\'C1\',30,20),(\'C2\',30,20),(\'D1\',20,20),(\'D2\',20,20)');
        
        // Insert ubicaciones
        for (let z of ['A1','A2','B1','B2','C1','C2','D1','D2']) {
            const cols = (z === 'B1' || z === 'B2' || z === 'C1' || z === 'C2') ? 30 : 20;
            const zres = await pool.query('SELECT id FROM zonas WHERE nombre = $1', [z]);
            if (zres.rows.length > 0) {
                for (let c = 1; c <= cols; c++) {
                    for (let f = 1; f <= 20; f++) {
                        await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3)', [zres.rows[0].id, c, f]);
                    }
                }
            }
        }
        
        res.json({ ok: true });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== APIs =====
app.get('/api/paises', async (req, res) => {
    const r = await pool.query('SELECT * FROM paises ORDER BY nombre');
    res.json(r.rows);
});

app.get('/api/regiones/:paisId', async (req, res) => {
    const r = await pool.query('SELECT * FROM regiones WHERE pais_id = $1', [req.params.paisId]);
    res.json(r.rows);
});

app.get('/api/tipos', async (req, res) => {
    const r = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
    res.json(r.rows);
});

app.get('/api/variedades', async (req, res) => {
    const r = await pool.query('SELECT * FROM variedades ORDER BY nombre');
    res.json(r.rows);
});

app.get('/api/ocupadas', async (req, res) => {
    const r = await pool.query('SELECT z.nombre as zona, u.columna, u.fila FROM ubicaciones u JOIN zonas z ON u.zona_id = z.id WHERE u.disponible = false');
    res.json(r.rows);
});

app.get('/api/disponibilidad', async (req, res) => {
    const disp = await pool.query('SELECT COUNT(*) as c FROM ubicaciones WHERE disponible = true');
    const ocup = await pool.query('SELECT COUNT(*) as c FROM ubicaciones WHERE disponible = false');
    res.json({ libre: parseInt(disp.rows[0].c), ocupada: parseInt(ocup.rows[0].c) });
});

app.get('/api/buscar', async (req, res) => {
    const { nombre, tipo, variedad, ano, bodega } = req.query;
    let q = 'SELECT DISTINCT v.*, tv.nombre as tipo_nombre, z.nombre as zona, u.columna, u.fila FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id LEFT JOIN zonas z ON u.zona_id = z.id LEFT JOIN vino_variedades vv ON v.id = vv.vino_id LEFT JOIN variedades var ON vv.variedad_id = var.id WHERE 1=1';
    const params = [];
    
    if (nombre) { params.push('%'+nombre+'%'); q += ' AND (v.nombre_vino ILIKE $' + params.length + ' OR v.bodega ILIKE $' + params.length + ')'; }
    if (tipo) { params.push(tipo); q += ' AND v.tipo_vino_id = $' + params.length; }
    if (bodega) { params.push('%'+bodega+'%'); q += ' AND v.bodega ILIKE $' + params.length; }
    if (ano) { params.push(ano); q += ' AND v.ano = $' + params.length; }
    if (variedad) { params.push(variedad); q += ' AND var.id = $' + params.length; }
    
    q += ' ORDER BY v.fecha_ingreso DESC LIMIT 100';
    const r = await pool.query(q, params);
    res.json(r.rows);
});

app.get('/api/vinos/qr/:code', async (req, res) => {
    const r = await pool.query('SELECT v.*, tv.nombre as tipo_nombre, z.nombre as zona, u.columna, u.fila FROM vinos v LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id LEFT JOIN zonas z ON u.zona_id = z.id WHERE v.codigo_qr = $1', [req.params.code]);
    res.json(r.rows.length > 0 ? r.rows[0] : { error: 'No' });
});

app.post('/api/registrar', async (req, res) => {
    const { nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, variedades, ubicaciones } = req.body;
    
    const vinos_registrados = [];
    
    for (const ub of ubicaciones) {
        const code = crypto.randomBytes(16).toString('hex');
        const zres = await pool.query('SELECT id FROM zonas WHERE nombre = $1', [ub.zona]);
        const zona_id = zres.rows[0].id;
        
        const ubres = await pool.query('SELECT id FROM ubicaciones WHERE zona_id = $1 AND columna = $2 AND fila = $3 AND disponible = true LIMIT 1', [zona_id, ub.col, ub.fila]);
        if (ubres.rows.length === 0) return res.json({ error: 'Ubicación ocupada: ' + ub.zona });
        
        const ub_id = ubres.rows[0].id;
        const vres = await pool.query('INSERT INTO vinos (codigo_qr, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [code, nombre_vino, tipo_vino_id, pais_id, region_id, bodega, ano, ub_id]);
        const vid = vres.rows[0].id;
        
        for (const vid_var of variedades) {
            await pool.query('INSERT INTO vino_variedades (vino_id, variedad_id) VALUES ($1,$2)', [vid, vid_var]);
        }
        
        await pool.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ub_id]);
        await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento) VALUES ($1, $2)', [vid, 'Entrada']);
        
        vinos_registrados.push({ codigo_qr: code, zona: ub.zona, col: ub.col, fila: ub.fila });
    }
    
    res.json({ ok: true, vinos: vinos_registrados });
});

app.post('/api/movimiento/:vinoId', async (req, res) => {
    const { tipo } = req.body;
    const vid = req.params.vinoId;
    
    const tiposMap = { consumo: 'Consumo', venta: 'Venta', dano: 'Daño', perdida: 'Pérdida' };
    
    await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento) VALUES ($1, $2)', [vid, tiposMap[tipo]]);
    const vres = await pool.query('SELECT ubicacion_id FROM vinos WHERE id = $1', [vid]);
    if (vres.rows[0].ubicacion_id) {
        await pool.query('UPDATE ubicaciones SET disponible = true WHERE id = $1', [vres.rows[0].ubicacion_id]);
    }
    await pool.query('UPDATE vinos SET ubicacion_id = NULL, estado = $1 WHERE id = $2', ['Consumido', vid]);
    
    res.json({ ok: true });
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bodega de Candinho</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: Arial; background:#1a1a1a; color:#fff; }
        .container { max-width:1200px; margin:0 auto; padding:20px; }
        header { text-align:center; padding:20px 0; border-bottom:3px solid #D4AF37; margin-bottom:20px; }
        h1 { color:#D4AF37; }
        .tabs { display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
        .tab-btn { padding:10px 15px; background:#4CAF50; border:0; color:#fff; cursor:pointer; border-radius:3px; }
        .tab-btn.active { background:#D4AF37; color:#000; }
        .tab-content { display:none; background:#2d2d2d; padding:15px; border-radius:3px; }
        .tab-content.active { display:block; }
        input, select, textarea { width:100%; padding:8px; margin:8px 0; background:#333; border:1px solid #555; color:#fff; border-radius:3px; }
        label { display:block; margin-top:12px; color:#D4AF37; font-weight:bold; }
        button { width:100%; padding:10px; background:#4CAF50; color:#fff; border:0; border-radius:3px; cursor:pointer; font-weight:bold; }
        button:hover { background:#45a049; }
        .msg { margin-top:15px; padding:15px; border-radius:3px; }
        .msg.ok { background:#1a3a1a; border-left:4px solid #4CAF50; }
        .msg.err { background:#3a1a1a; border-left:4px solid #f44336; }
        .info { background:rgba(212,175,55,0.2); padding:10px; margin:10px 0; border-radius:3px; }
        table { width:100%; border-collapse:collapse; margin-top:15px; }
        table th, table td { padding:8px; text-align:left; border-bottom:1px solid #444; }
        table th { background:rgba(212,175,55,0.2); }
        .section { background:rgba(0,0,0,0.2); padding:15px; margin:15px 0; border-radius:3px; }
        .checkbox-group { display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin:10px 0; }
        .checkbox-group label { margin:0; display:flex; align-items:center; }
        .checkbox-group input { width:auto; margin-right:5px; }
    </style>
</head>
<body>
    <header>
        <h1>🍷 Bodega de Candinho</h1>
    </header>

    <div class="container">
        <div class="tabs">
            <button class="tab-btn active" onclick="tab('movimientos')">🔄 Movimientos</button>
            <button class="tab-btn" onclick="tab('inventario')">📚 Inventario</button>
            <button class="tab-btn" onclick="tab('scanner')">📱 Scanner</button>
            <button class="tab-btn" onclick="tab('admin')">⚙️ Admin</button>
        </div>

        <div id="movimientos" class="tab-content active">
            <h2>🔄 Movimientos</h2>
            
            <div class="section">
                <h3>🔍 Buscar Vinos</h3>
                <input id="sNombre" placeholder="Nombre/Bodega">
                <select id="sTipo"><option value="">- Tipo -</option></select>
                <select id="sVariedad"><option value="">- Variedad -</option></select>
                <input id="sAno" type="number" placeholder="Año">
                <input id="sBodega" placeholder="Bodega">
                <button onclick="buscar()">BUSCAR</button>
                <div id="searchRes"></div>
            </div>

            <hr style="margin:20px 0; border:0; border-top:1px solid #555;">
            
            <div class="section">
                <h3>Tipo Movimiento</h3>
                <select id="movTipo" onchange="cambiarMov()">
                    <option value="">- Seleccionar -</option>
                    <option value="entrada">📥 Entrada (Registrar)</option>
                    <option value="consumo">🍷 Consumo</option>
                    <option value="venta">💰 Venta</option>
                    <option value="dano">⚠️ Daño</option>
                    <option value="perdida">❌ Pérdida</option>
                </select>
            </div>

            <div id="formEntrada" style="display:none;" class="section">
                <h3>Registrar Botellas</h3>
                <div class="info" id="cap">Cargando...</div>
                <label>Nombre del Vino</label>
                <input id="entNombre" type="text">
                <label>Bodega</label>
                <input id="entBodega" type="text">
                <label>Año</label>
                <input id="entAno" type="number">
                <label>País</label>
                <select id="entPais" onchange="cargarReg()"></select>
                <label>Región</label>
                <select id="entRegion" onchange="cargarTipo()"></select>
                <label>Tipo Vino</label>
                <select id="entTipo"></select>
                <label>Variedades (marca 1 o más)</label>
                <div id="varList" class="checkbox-group"></div>
                <label>Cantidad Botellas</label>
                <input id="cantidad" type="number" value="1" onchange="actUbicaciones()">
                <div id="ubList"></div>
                <button onclick="registrar()">REGISTRAR BOTELLAS</button>
                <div id="entMsg"></div>
            </div>

            <div id="formMov" style="display:none;" class="section">
                <h3 id="movTit"></h3>
                <input id="qrBusca" type="text" placeholder="Escanea o pega código QR">
                <button onclick="buscarQR()">BUSCAR</button>
                <div id="vinoInfo" style="display:none; background:#0a3a0a; padding:10px; margin:10px 0; border-radius:3px;"></div>
                <label>Razón</label>
                <textarea id="movRazon" rows="2"></textarea>
                <button onclick="registrarMov()">REGISTRAR MOVIMIENTO</button>
                <div id="movMsg"></div>
            </div>
        </div>

        <div id="inventario" class="tab-content">
            <h2>📚 Inventario</h2>
            <button onclick="cargarInv()">CARGAR</button>
            <div id="invTable" style="margin-top:20px;"></div>
        </div>

        <div id="scanner" class="tab-content">
            <h2>📱 Scanner QR</h2>
            <input id="scanCode" type="text" autofocus placeholder="Escanea aquí">
            <button onclick="scanVino()">BUSCAR</button>
            <div id="scanRes" style="display:none; padding:10px; background:#0a3a0a; margin-top:15px; border-radius:3px;"></div>
        </div>

        <div id="admin" class="tab-content">
            <h2>⚙️ Admin</h2>
            <button onclick="initDB()">INICIALIZAR BD</button>
            <div id="adminMsg" style="display:none; margin-top:15px;"></div>
        </div>
    </div>

    <script>
        let vinoActual = null;
        let allTipos = [];
        let allVars = [];
        let ocupadas = [];
        const zonas = { A1:20, A2:20, B1:30, B2:30, C1:30, C2:30, D1:20, D2:20 };
        let ubs = [];

        function tab(t) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
            document.getElementById(t).classList.add('active');
            event.target.classList.add('active');
        }

        async function init() {
            const paises = await fetch('/api/paises').then(r => r.json());
            allTipos = await fetch('/api/tipos').then(r => r.json());
            allVars = await fetch('/api/variedades').then(r => r.json());
            ocupadas = await fetch('/api/ocupadas').then(r => r.json());

            document.getElementById('entPais').innerHTML += paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            document.getElementById('sTipo').innerHTML += allTipos.map(t => '<option value="' + t.id + '">' + t.nombre + '</option>').join('');
            document.getElementById('sVariedad').innerHTML += allVars.map(v => '<option value="' + v.id + '">' + v.nombre + '</option>').join('');

            cargarCap();
        }

        async function cargarCap() {
            const d = await fetch('/api/disponibilidad').then(r => r.json());
            document.getElementById('cap').textContent = 'Disponibles: ' + d.libre + ' | Ocupadas: ' + d.ocupada;
        }

        async function cargarReg() {
            const pid = document.getElementById('entPais').value;
            const regs = await fetch('/api/regiones/' + pid).then(r => r.json());
            document.getElementById('entRegion').innerHTML = '<option>-Región-</option>' + regs.map(r => '<option value="' + r.id + '">' + r.nombre + '</option>').join('');
        }

        async function cargarTipo() {
            const regEl = document.getElementById('entRegion');
            const regName = regEl.options[regEl.selectedIndex].text;
            let html = '<option>-Tipo-</option>';
            allTipos.forEach(t => {
                if (t.nombre === 'Champagne' && regName !== 'Champagne') return;
                html += '<option value="' + t.id + '">' + t.nombre + '</option>';
            });
            document.getElementById('entTipo').innerHTML = html;
            mostrarVars();
        }

        function mostrarVars() {
            document.getElementById('varList').innerHTML = allVars.map(v => '<label><input type="checkbox" value="' + v.id + '">' + v.nombre + '</label>').join('');
        }

        function actUbicaciones() {
            const cant = parseInt(document.getElementById('cantidad').value) || 1;
            let html = '';
            ubs = [];
            for (let i = 0; i < cant; i++) {
                html += '<div style="background:rgba(0,0,0,0.3); padding:10px; margin:10px 0; border-radius:3px;">';
                html += '<b>Botella ' + (i+1) + '</b><br>';
                html += '<label>Zona</label>';
                html += '<select onchange="updCol(' + i + ')" id="z' + i + '"><option>-</option>';
                Object.keys(zonas).forEach(z => html += '<option value="' + z + '">' + z + '</option>');
                html += '</select>';
                html += '<label>Columna</label>';
                html += '<select onchange="updFil(' + i + ')" id="c' + i + '"><option>-</option></select>';
                html += '<label>Fila</label>';
                html += '<select onchange="checkUb(' + i + ')" id="f' + i + '"><option>-</option></select>';
                html += '<div id="st' + i + '" style="margin-top:8px;"></div>';
                html += '</div>';
                ubs[i] = {};
            }
            document.getElementById('ubList').innerHTML = html;
        }

        function updCol(i) {
            const z = document.getElementById('z' + i).value;
            const csel = document.getElementById('c' + i);
            csel.innerHTML = '<option>-</option>';
            if (!z) return;
            for (let x = 1; x <= zonas[z]; x++) csel.innerHTML += '<option value="' + x + '">Col ' + x + '</option>';
            ubs[i].zona = z;
        }

        function updFil(i) {
            const fsel = document.getElementById('f' + i);
            fsel.innerHTML = '<option>-</option>';
            for (let y = 1; y <= 20; y++) fsel.innerHTML += '<option value="' + y + '">Fila ' + y + '</option>';
            ubs[i].col = document.getElementById('c' + i).value;
        }

        function checkUb(i) {
            const z = ubs[i].zona;
            const c = ubs[i].col;
            const f = document.getElementById('f' + i).value;
            ubs[i].fila = f;
            const oc = ocupadas.some(u => u.zona === z && u.columna == c && u.fila == f);
            const st = document.getElementById('st' + i);
            st.innerHTML = oc ? '<span style="color:#f44336;">❌ OCUPADA</span>' : '<span style="color:#4CAF50;">✅ Disponible</span>';
        }

        function cambiarMov() {
            const t = document.getElementById('movTipo').value;
            document.getElementById('formEntrada').style.display = t === 'entrada' ? 'block' : 'none';
            document.getElementById('formMov').style.display = (t && t !== 'entrada') ? 'block' : 'none';
            if (t && t !== 'entrada') {
                document.getElementById('movTit').textContent = t.toUpperCase();
                document.getElementById('qrBusca').value = '';
                document.getElementById('vinoInfo').style.display = 'none';
                vinoActual = null;
            }
            if (t === 'entrada') actUbicaciones();
        }

        async function registrar() {
            const vars = Array.from(document.querySelectorAll('#varList input:checked')).map(c => c.value);
            const ubs_fil = ubs.filter(u => u.zona && u.col && u.fila);

            if (!document.getElementById('entNombre').value || !document.getElementById('entTipo').value || !document.getElementById('entPais').value || !document.getElementById('entRegion').value || !document.getElementById('entBodega').value || !document.getElementById('entAno').value || vars.length === 0 || ubs_fil.length === 0) {
                alert('Completa TODOS los campos');
                return;
            }

            // Validar que no haya ubicaciones duplicadas
            const ubicacionesStr = ubs_fil.map(u => u.zona + '-' + u.col + '-' + u.fila);
            const duplicadas = ubicacionesStr.filter((v, i, a) => a.indexOf(v) !== i);
            if (duplicadas.length > 0) {
                alert('❌ ERROR: No puedes usar la MISMA ubicación para múltiples botellas.\nUbicaciones duplicadas: ' + duplicadas.join(', '));
                return;
            }

            const res = await fetch('/api/registrar', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    nombre_vino: document.getElementById('entNombre').value,
                    tipo_vino_id: document.getElementById('entTipo').value,
                    pais_id: document.getElementById('entPais').value,
                    region_id: document.getElementById('entRegion').value,
                    bodega: document.getElementById('entBodega').value,
                    ano: document.getElementById('entAno').value,
                    variedades: vars,
                    ubicaciones: ubs_fil
                })
            }).then(r => r.json());

            const msg = document.getElementById('entMsg');
            if (res.ok) {
                let html = '<div class="msg ok">✅ REGISTRADO: ' + res.vinos.length + ' botella(s)<br>';
                res.vinos.forEach(v => html += '<div style="margin-top:8px;"><b>' + v.zona + '-' + v.col + '-' + v.fila + '</b><br><code>' + v.codigo_qr + '</code></div>');
                html += '</div>';
                msg.innerHTML = html;
                document.getElementById('entNombre').value = '';
                document.getElementById('entBodega').value = '';
                document.getElementById('entAno').value = '';
                document.getElementById('cantidad').value = '1';
                actUbicaciones();
                cargarCap();
            } else {
                msg.innerHTML = '<div class="msg err">❌ ' + res.error + '</div>';
            }
        }

        async function buscarQR() {
            const code = document.getElementById('qrBusca').value.trim();
            const res = await fetch('/api/vinos/qr/' + code).then(r => r.json());
            const vi = document.getElementById('vinoInfo');
            if (res.error) {
                vi.innerHTML = '❌ NO ENCONTRADO';
            } else {
                vinoActual = res;
                const ub = res.zona ? res.zona + '(' + res.columna + ',' + res.fila + ')' : 'N/A';
                vi.innerHTML = res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ') | ' + ub;
            }
            vi.style.display = 'block';
        }

        async function registrarMov() {
            if (!vinoActual) { alert('Busca primero'); return; }
            const t = document.getElementById('movTipo').value;
            await fetch('/api/movimiento/' + vinoActual.id, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tipo: t })
            });
            document.getElementById('movMsg').innerHTML = '<div class="msg ok">✅ REGISTRADO</div>';
            document.getElementById('qrBusca').value = '';
        }

        async function buscar() {
            const n = document.getElementById('sNombre').value;
            const t = document.getElementById('sTipo').value;
            const v = document.getElementById('sVariedad').value;
            const a = document.getElementById('sAno').value;
            const b = document.getElementById('sBodega').value;

            let url = '/api/buscar?';
            if (n) url += 'nombre=' + encodeURIComponent(n) + '&';
            if (t) url += 'tipo=' + t + '&';
            if (v) url += 'variedad=' + v + '&';
            if (a) url += 'ano=' + a + '&';
            if (b) url += 'bodega=' + encodeURIComponent(b) + '&';

            const res = await fetch(url).then(r => r.json());
            let html = '';
            if (res.length === 0) {
                html = '<div class="msg err">NO ENCONTRADO</div>';
            } else {
                html = '<div class="msg ok">' + res.length + ' ENCONTRADO(S)</div>';
                html += '<table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th></tr>';
                res.forEach(r => {
                    const ub = r.zona ? r.zona + '(' + r.columna + ',' + r.fila + ')' : 'N/A';
                    html += '<tr><td>' + r.nombre_vino + '</td><td>' + r.bodega + '</td><td>' + r.ano + '</td><td>' + (r.tipo_nombre || '-') + '</td><td>' + ub + '</td></tr>';
                });
                html += '</table>';
            }
            document.getElementById('searchRes').innerHTML = html;
        }

        async function cargarInv() {
            const res = await fetch('/api/buscar').then(r => r.json());
            let html = '<table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th></tr>';
            res.forEach(r => {
                const ub = r.zona ? r.zona + '(' + r.columna + ',' + r.fila + ')' : '-';
                html += '<tr><td>' + r.nombre_vino + '</td><td>' + r.bodega + '</td><td>' + r.ano + '</td><td>' + (r.tipo_nombre || '-') + '</td><td>' + ub + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('invTable').innerHTML = html;
        }

        async function scanVino() {
            const code = document.getElementById('scanCode').value.trim();
            const res = await fetch('/api/vinos/qr/' + code).then(r => r.json());
            const sr = document.getElementById('scanRes');
            if (res.error) {
                sr.textContent = '❌ NO ENCONTRADO';
            } else {
                const ub = res.zona ? res.zona + '(' + res.columna + ',' + res.fila + ')' : '-';
                sr.textContent = res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ') | ' + ub;
            }
            sr.style.display = 'block';
        }

        async function initDB() {
            await fetch('/setup');
            document.getElementById('adminMsg').innerHTML = '<div class="msg ok">✅ BD INICIALIZADA</div>';
            setTimeout(() => location.reload(), 2000);
        }

        window.onload = init;
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
