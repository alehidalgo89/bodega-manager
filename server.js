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
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150), ano INTEGER, ubicacion_id INTEGER REFERENCES ubicaciones(id), estado VARCHAR(20) DEFAULT \'Disponible\', fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
        await pool.query('CREATE TABLE vino_variedades (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id), variedad_id INTEGER REFERENCES variedades(id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id), tipo_movimiento VARCHAR(50), fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

        await pool.query('INSERT INTO tipos_vino (nombre) VALUES (\'Tinto\'),(\'Blanco\'),(\'Rosado\'),(\'Espumante\'),(\'Champagne\')');
        
        const vars = ['Chardonnay','Pinot Noir','Merlot','Cabernet Sauvignon','Syrah','Riesling','Sauvignon Blanc','Tempranillo','Babić','Plavac Mali'];
        for (const v of vars) {
            await pool.query('INSERT INTO variedades (nombre) VALUES ($1)', [v]);
        }
        
        const paises = [['Francia','FR'],['Italia','IT'],['España','ES'],['Argentina','AR'],['Chile','CL']];
        for (const [n,c] of paises) {
            await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2)', [n, c]);
        }
        
        const regiones = {
            'Francia': ['Champagne','Bordeaux','Rhône'],
            'Italia': ['Toscana','Piamonte'],
            'España': ['Rioja','Ribera del Duero'],
            'Argentina': ['Mendoza'],
            'Chile': ['Maule']
        };
        for (const [pais, regs] of Object.entries(regiones)) {
            const pres = await pool.query('SELECT id FROM paises WHERE nombre = $1', [pais]);
            if (pres.rows.length > 0) {
                for (const r of regs) {
                    await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ($1, $2)', [pres.rows[0].id, r]);
                }
            }
        }
        
        await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES (\'A1\',20,20),(\'A2\',20,20),(\'B1\',30,20),(\'B2\',30,20),(\'C1\',30,20),(\'C2\',30,20),(\'D1\',20,20),(\'D2\',20,20)');
        
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

// ===== API =====
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
    const { nombre, tipo, bodega, ano, variedad } = req.query;
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
    const estadoMap = { consumo: 'Consumido', venta: 'Vendido', dano: 'Dañado', perdida: 'Perdido' };
    
    await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento) VALUES ($1, $2)', [vid, tiposMap[tipo]]);
    const vres = await pool.query('SELECT ubicacion_id FROM vinos WHERE id = $1', [vid]);
    if (vres.rows[0].ubicacion_id) {
        await pool.query('UPDATE ubicaciones SET disponible = true WHERE id = $1', [vres.rows[0].ubicacion_id]);
    }
    await pool.query('UPDATE vinos SET ubicacion_id = NULL, estado = $1 WHERE id = $2', [estadoMap[tipo] || 'Consumido', vid]);
    
    res.json({ ok: true });
});

app.post('/api/agregar-pais', async (req, res) => {
    const { nombre, codigo_iso } = req.body;
    if (!nombre || !codigo_iso) return res.json({ error: 'Nombre y código requeridos' });
    try {
        const result = await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES ($1, $2) RETURNING *', [nombre, codigo_iso]);
        res.json({ ok: true, pais: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'El país ya existe' : err.message });
    }
});

app.post('/api/agregar-variedad', async (req, res) => {
    const { nombre } = req.body;
    if (!nombre) return res.json({ error: 'Nombre requerido' });
    try {
        const result = await pool.query('INSERT INTO variedades (nombre) VALUES ($1) RETURNING *', [nombre]);
        res.json({ ok: true, variedad: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message.includes('duplicate') ? 'La variedad ya existe' : err.message });
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

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bodega de Candinho</title>
            <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body { 
            font-family: 'Segoe UI', -apple-system, system-ui, sans-serif;
            background: #0f0f0f;
            color: #f5f5f5;
        }
        
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        header { 
            text-align: center; 
            padding: 30px 0 20px;
            border-bottom: 2px solid #d4af37;
            margin-bottom: 20px;
        }
        
        h1 { 
            font-family: Georgia, serif;
            font-size: 2em;
            color: #d4af37;
            margin-bottom: 5px;
        }
        
        header p {
            color: #a8a8a8;
            font-size: 0.9em;
        }
        
        .tabs { 
            display: flex;
            gap: 0;
            margin-bottom: 20px;
            flex-wrap: wrap;
            border-bottom: 1px solid #2d2d2d;
        }
        
        .tab-btn { 
            padding: 12px 20px;
            background: transparent;
            border: none;
            color: #a8a8a8;
            cursor: pointer;
            font-weight: 500;
            font-size: 1em;
            border-bottom: 3px solid transparent;
            transition: all 0.3s;
        }
        
        .tab-btn:hover {
            color: #d4af37;
            border-bottom-color: #d4af37;
        }
        
        .tab-btn.active { 
            color: #d4af37;
            border-bottom-color: #d4af37;
        }
        
        .tab-content { 
            display: none;
            padding: 20px;
        }
        
        .tab-content.active { 
            display: block;
        }
        
        .tab-content h2 {
            font-size: 1.5em;
            margin-bottom: 20px;
            color: #f5f5f5;
        }
        
        input, select, textarea { 
            width: 100%; 
            padding: 10px;
            margin: 8px 0;
            background: #1a1a1a;
            border: 1px solid #404040;
            color: #f5f5f5;
            border-radius: 4px;
            font-size: 1em;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #d4af37;
            background: #252525;
        }
        
        label { 
            display: block;
            margin-top: 10px;
            color: #f5f5f5;
            font-weight: 500;
        }
        
        button { 
            padding: 10px 20px;
            background: #d4af37;
            color: #000;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.9em;
            margin: 10px 10px 10px 0;
        }
        
        button:hover { 
            background: #e8c547;
            transform: translateY(-2px);
        }
        
        button:active {
            transform: translateY(0);
        }
        
        .info { 
            background: rgba(212, 175, 55, 0.15);
            padding: 10px;
            margin: 10px 0;
            border-left: 4px solid #d4af37;
            color: #d4af37;
        }
        
        table { 
            width: 100%; 
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        table th { 
            background: rgba(212, 175, 55, 0.2);
            padding: 10px;
            text-align: left;
            font-weight: 600;
            color: #d4af37;
            border-bottom: 2px solid #d4af37;
        }
        
        table td { 
            padding: 10px;
            border-bottom: 1px solid #2d2d2d;
        }
        
        table tr:hover {
            background: rgba(212, 175, 55, 0.05);
        }
        
        .section { 
            background: rgba(30, 30, 30, 0.5);
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
            border: 1px solid #2d2d2d;
        }
        
        .section h3 {
            font-size: 1.1em;
            margin-bottom: 10px;
            color: #d4af37;
        }
        
        .checkbox-group { 
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin: 10px 0;
        }
        
        .checkbox-group label { 
            margin: 0;
            display: flex;
            align-items: center;
            color: #f5f5f5;
            font-weight: 400;
        }
        
        .checkbox-group input { 
            width: auto;
            margin: 0 8px 0 0;
            accent-color: #d4af37;
        }
        
        .msg { 
            padding: 10px;
            margin: 10px 0;
            border-left: 4px solid;
            border-radius: 4px;
        }
        
        .msg.ok { 
            background: rgba(74, 124, 89, 0.2);
            border-left-color: #4a7c59;
            color: #6bc976;
        }
        
        .msg.err { 
            background: rgba(201, 76, 76, 0.2);
            border-left-color: #c94c4c;
            color: #ff6b6b;
        }
        
        @media (max-width: 768px) {
            h1 { font-size: 1.5em; }
            .tab-btn { padding: 10px 15px; font-size: 0.9em; }
            button { padding: 8px 12px; margin: 8px 5px 8px 0; }
        }
    </style>


</head>
<body>
    <header>
        <h1>Bodega de Candinho</h1>
        <p>Sistema de gestión de inventario</p>
    </header>

    <div class="container">
        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('movimientos')">🔄 Movimientos</button>
            <button class="tab-btn" onclick="switchTab('inventario')">📚 Inventario</button>
            <button class="tab-btn" onclick="switchTab('scanner')">📱 Scanner</button>
            <button class="tab-btn" onclick="switchTab('datos')">➕ Datos</button>
            <button class="tab-btn" onclick="switchTab('admin')">⚙️ Admin</button>
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
                <button onclick="buscarVinos()">BUSCAR</button>
                <div id="searchRes"></div>
            </div>

            <hr style="margin:20px 0; border:0; border-top:1px solid #555;">
            
            <div class="section">
                <h3>Tipo Movimiento</h3>
                <select id="movTipo" onchange="cambiarMovimiento()">
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
                <select id="entPais" onchange="loadRegiones()"></select>
                <label>Región</label>
                <select id="entRegion" onchange="loadTipos()"></select>
                <label>Tipo Vino</label>
                <select id="entTipo"><option value="">- Tipo -</option></select>
                <label>Variedades (marca 1 o más)</label>
                <div id="varList" class="checkbox-group"></div>
                <label>Cantidad Botellas</label>
                <input id="cantidad" type="number" value="1" onchange="actualizarUbicaciones()">
                <div id="ubList"></div>
                <button onclick="registrarBotellas()">REGISTRAR BOTELLAS</button>
                <div id="entMsg"></div>
            </div>

            <div id="formMov" style="display:none;" class="section">
                <h3 id="movTit"></h3>
                <div class="info" style="margin-top: 15px;">
                    Busca por: <strong>Nombre, Bodega, Año o Código QR</strong>
                </div>
                <input id="qrBusca" type="text" placeholder="Ingresa búsqueda...">
                <button onclick="buscarPorQR()">BUSCAR</button>
                <div id="vinoInfo" style="display:none; margin:15px 0; padding:15px; background:rgba(74,124,89,0.2); border-left:4px solid #4a7c59; border-radius:8px; color:#f5f5f5;"></div>
                
                <div id="ubicacionesDisponibles" style="display:none; margin:20px 0;">
                    <label>Selecciona ubicación específica</label>
                    <div id="ubicacionesList" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); gap:10px; margin-top:10px;"></div>
                </div>
                
                <div id="cantidadDiv" style="display:none; margin:15px 0;">
                    <label>Cantidad a registrar</label>
                    <input id="cantidadMov" type="number" value="1" min="1">
                </div>
                <textarea id="movRazon" rows="2" placeholder="Razón (opcional)"></textarea>
                <button onclick="registrarMovimiento()">REGISTRAR MOVIMIENTO</button>
                <div id="movMsg"></div>
            </div>
        </div>

        <div id="inventario" class="tab-content">
            <h2>📚 Inventario</h2>
            <div class="section">
                <h3>🔍 Filtros</h3>
                <input id="filtroNombre" type="text" placeholder="Filtrar por nombre/bodega">
                <select id="filtroTipo">
                    <option value="">- Tipo -</option>
                </select>
                <select id="filtroEstado">
                    <option value="">- Estado -</option>
                    <option value="Disponible">Disponible</option>
                    <option value="Consumido">Consumido</option>
                    <option value="Vendido">Vendido</option>
                    <option value="Dañado">Dañado</option>
                    <option value="Perdido">Perdido</option>
                </select>
                <button onclick="cargarInventario()">APLICAR FILTROS</button>
                <button onclick="limpiarFiltros()">LIMPIAR</button>
            </div>
            <div id="invTable" style="margin-top:20px;"></div>
        </div>

        <div id="scanner" class="tab-content">
            <h2>📱 Scanner QR</h2>
            <input id="scanCode" type="text" autofocus placeholder="Escanea aquí">
            <button onclick="escanearVino()">BUSCAR</button>
            <div id="scanRes"></div>
        </div>

        <div id="datos" class="tab-content">
            <h2>➕ Datos Maestros</h2>
            <div class="section">
                <h3>Agregar País</h3>
                <input id="newPais" placeholder="Nombre">
                <input id="newCodia" type="text" maxlength="2" placeholder="Código ISO (ej: FR)">
                <button onclick="addPais()">Agregar País</button>
                <div id="paisMsg"></div>
            </div>
            <div class="section">
                <h3>Agregar Variedad de Uva</h3>
                <input id="newVar" placeholder="Nombre">
                <button onclick="addVar()">Agregar Variedad</button>
                <div id="varMsg"></div>
            </div>
            <div class="section">
                <h3>Agregar Región</h3>
                <select id="regPais"></select>
                <input id="newRegNombre" placeholder="Nombre de Región">
                <button onclick="addReg()">Agregar Región</button>
                <div id="regMsg"></div>
            </div>
        </div>

        <div id="admin" class="tab-content">
            <h2>⚙️ Admin</h2>
            <button onclick="inicializarBD()">INICIALIZAR BD</button>
            <div id="adminMsg"></div>
        </div>
    </div>

    <script>
        let vinoActual = null;
        let allTipos = [];
        let allVars = [];
        let ocupadas = [];
        const zonas = { A1:20, A2:20, B1:30, B2:30, C1:30, C2:30, D1:20, D2:20 };
        let ubicacionesArray = [];

        function switchTab(t) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
            document.getElementById(t).classList.add('active');
            event.target.classList.add('active');
        }

        async function inicializar() {
            const paises = await fetch('/api/paises').then(r => r.json());
            allTipos = await fetch('/api/tipos').then(r => r.json());
            allVars = await fetch('/api/variedades').then(r => r.json());
            ocupadas = await fetch('/api/ocupadas').then(r => r.json());

            document.getElementById('entPais').innerHTML = '<option value="">- País -</option>' + paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            document.getElementById('regPais').innerHTML = paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            document.getElementById('sTipo').innerHTML += allTipos.map(t => '<option value="' + t.id + '">' + t.nombre + '</option>').join('');
            document.getElementById('filtroTipo').innerHTML += allTipos.map(t => '<option value="' + t.nombre + '">' + t.nombre + '</option>').join('');
            document.getElementById('sVariedad').innerHTML += allVars.map(v => '<option value="' + v.id + '">' + v.nombre + '</option>').join('');

            // Pre-cargar primer país, región y tipo
            if (paises.length > 0) {
                document.getElementById('entPais').value = paises[0].id;
                await loadRegiones();
            }

            cargarCapacidad();
        }

        async function cargarCapacidad() {
            const d = await fetch('/api/disponibilidad').then(r => r.json());
            document.getElementById('cap').textContent = 'Disponibles: ' + d.libre + ' | Ocupadas: ' + d.ocupada;
        }

        async function loadRegiones() {
            const pid = document.getElementById('entPais').value;
            if (!pid) return;
            const regs = await fetch('/api/regiones/' + pid).then(r => r.json());
            document.getElementById('entRegion').innerHTML = '<option value="">- Región -</option>' + regs.map(r => '<option value="' + r.id + '">' + r.nombre + '</option>').join('');
            
            // Auto-seleccionar primera región
            if (regs.length > 0) {
                document.getElementById('entRegion').value = regs[0].id;
                await loadTipos(); // Cargar tipos de esa región
            }
        }

        async function loadTipos() {
            const regEl = document.getElementById('entRegion');
            const regName = regEl.options[regEl.selectedIndex].text;
            let html = '<option value="">- Tipo -</option>';
            allTipos.forEach(t => {
                if (t.nombre === 'Champagne' && regName !== 'Champagne') return;
                html += '<option value="' + t.id + '">' + t.nombre + '</option>';
            });
            document.getElementById('entTipo').innerHTML = html;
            mostrarVariedades();
        }

        function mostrarVariedades() {
            document.getElementById('varList').innerHTML = allVars.map(v => '<label><input type="checkbox" value="' + v.id + '">' + v.nombre + '</label>').join('');
        }

        function actualizarUbicaciones() {
            const cant = parseInt(document.getElementById('cantidad').value) || 1;
            let html = '';
            ubicacionesArray = [];
            for (let i = 0; i < cant; i++) {
                html += '<div style="background:rgba(0,0,0,0.3); padding:10px; margin:10px 0; border-radius:3px;">';
                html += '<b>Botella ' + (i+1) + '</b><br>';
                html += '<label>Zona</label>';
                html += '<select onchange="updCols(' + i + ')" id="z' + i + '"><option>-</option>';
                Object.keys(zonas).forEach(z => html += '<option value="' + z + '">' + z + '</option>');
                html += '</select>';
                html += '<label>Columna</label>';
                html += '<select onchange="updFilas(' + i + ')" id="c' + i + '"><option>-</option></select>';
                html += '<label>Fila</label>';
                html += '<select onchange="checkUbicacion(' + i + ')" id="f' + i + '"><option>-</option></select>';
                html += '<div id="st' + i + '" style="margin-top:8px;"></div>';
                html += '</div>';
                ubicacionesArray[i] = {};
            }
            document.getElementById('ubList').innerHTML = html;
        }

        function updCols(i) {
            const z = document.getElementById('z' + i).value;
            const csel = document.getElementById('c' + i);
            csel.innerHTML = '<option>-</option>';
            if (!z) return;
            for (let x = 1; x <= zonas[z]; x++) csel.innerHTML += '<option value="' + x + '">Col ' + x + '</option>';
            ubicacionesArray[i].zona = z;
            document.getElementById('f' + i).innerHTML = '<option>-</option>';
            document.getElementById('st' + i).innerHTML = '';
            revalidarTodas();
        }

        function updFilas(i) {
            const fsel = document.getElementById('f' + i);
            fsel.innerHTML = '<option>-</option>';
            for (let y = 1; y <= 20; y++) fsel.innerHTML += '<option value="' + y + '">Fila ' + y + '</option>';
            ubicacionesArray[i].col = document.getElementById('c' + i).value;
            revalidarTodas();
        }
        
        function revalidarTodas() {
            for (let i = 0; i < ubicacionesArray.length; i++) {
                if (document.getElementById('f' + i) && document.getElementById('f' + i).value) {
                    checkUbicacion(i);
                }
            }
        }

        function checkUbicacion(i) {
            const z = ubicacionesArray[i].zona;
            const c = ubicacionesArray[i].col;
            const f = document.getElementById('f' + i).value;
            ubicacionesArray[i].fila = f;
            
            // Verificar si está ocupada en la BD
            const ocBD = ocupadas.some(u => u.zona === z && u.columna == c && u.fila == f);
            
            // Verificar si ya fue seleccionada en otra botella del MISMO formulario
            const ocLocal = ubicacionesArray.some((u, idx) => 
                idx !== i && u.zona === z && u.col === c && u.fila === f && u.zona && u.col && u.fila
            );
            
            const oc = ocBD || ocLocal;
            const st = document.getElementById('st' + i);
            
            if (oc) {
                st.innerHTML = '<span style="color:#f44336;">❌ OCUPADA o DUPLICADA</span>';
                document.getElementById('f' + i).style.borderColor = '#f44336';
            } else {
                st.innerHTML = '<span style="color:#4CAF50;">✅ Disponible</span>';
                document.getElementById('f' + i).style.borderColor = '#4CAF50';
            }
        }

        async function cambiarMovimiento() {
            const t = document.getElementById('movTipo').value;
            document.getElementById('formEntrada').style.display = t === 'entrada' ? 'block' : 'none';
            document.getElementById('formMov').style.display = (t && t !== 'entrada') ? 'block' : 'none';
            if (t && t !== 'entrada') {
                document.getElementById('movTit').textContent = t.toUpperCase();
                document.getElementById('qrBusca').value = '';
                document.getElementById('vinoInfo').style.display = 'none';
                document.getElementById('ubicacionesDisponibles').style.display = 'none';
                document.getElementById('cantidadDiv').style.display = 'none';
                vinoActual = null;
            }
            if (t === 'entrada') {
                document.getElementById('cantidad').value = '1';
                actualizarUbicaciones();
                mostrarVariedades();
                cargarCapacidad();
                // Auto-cargar regiones y tipos del primer país
                if (document.getElementById('entPais').value) {
                    await loadRegiones();
                }
            }
        }

        async function registrarBotellas() {
            const vars = Array.from(document.querySelectorAll('#varList input:checked')).map(c => c.value);
            const ubs_fil = ubicacionesArray.filter(u => u.zona && u.col && u.fila);

            if (!document.getElementById('entNombre').value || !document.getElementById('entTipo').value || !document.getElementById('entPais').value || !document.getElementById('entRegion').value || !document.getElementById('entBodega').value || !document.getElementById('entAno').value || vars.length === 0 || ubs_fil.length === 0) {
                alert('Completa TODOS los campos');
                return;
            }

            const ubicacionesStr = ubs_fil.map(u => u.zona + '-' + u.col + '-' + u.fila);
            const duplicadas = ubicacionesStr.filter((v, i, a) => a.indexOf(v) !== i);
            if (duplicadas.length > 0) {
                alert('ERROR: No puedes usar la MISMA ubicación para múltiples botellas');
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
                let html = '<div class="msg ok">✅ REGISTRADO: ' + res.vinos.length + ' botella(s)</div>';
                msg.innerHTML = html;
                document.getElementById('entNombre').value = '';
                document.getElementById('entBodega').value = '';
                document.getElementById('entAno').value = '';
                document.getElementById('cantidad').value = '1';
                actualizarUbicaciones();
                cargarCapacidad();
            } else {
                msg.innerHTML = '<div class="msg err">❌ ' + (res.error || 'Error') + '</div>';
            }
        }

        async function buscarPorQR() {
            const busca = document.getElementById('qrBusca').value.trim();
            if (!busca) return alert('Ingresa QR, nombre, bodega o año');
            
            const vi = document.getElementById('vinoInfo');
            const ubicDisp = document.getElementById('ubicacionesDisponibles');
            const ubicList = document.getElementById('ubicacionesList');
            
            // Buscar por QR primero
            let res = await fetch('/api/vinos/qr/' + busca).then(r => r.json());
            let encontrados = [];
            
            // Si no encuentra por QR, buscar por nombre/bodega/año
            if (res.error) {
                const allVinos = await fetch('/api/buscar').then(r => r.json());
                const busqueda = busca.toLowerCase();
                encontrados = allVinos.filter(v => 
                    (v.nombre_vino.toLowerCase().includes(busqueda) || 
                    v.bodega.toLowerCase().includes(busqueda) || 
                    v.ano == busca) &&
                    v.ubicacion_id !== null
                );
                
                if (encontrados.length === 0) {
                    res = { error: 'No encontrado' };
                } else {
                    res = encontrados[0];
                }
            } else if (res.ubicacion_id) {
                encontrados = [res];
            }
            
            if (res.error) {
                vi.innerHTML = '❌ NO ENCONTRADO - Intenta con nombre, bodega, año o QR';
                ubicDisp.style.display = 'none';
            } else {
                // Mostrar información del vino
                vinoActual = res;
                const ub = res.zona ? res.zona + '(' + res.columna + ',' + res.fila + ')' : 'N/A';
                vi.innerHTML = res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ')';
                
                // Si hay múltiples ubicaciones, mostrar lista seleccionable
                if (encontrados.length > 1) {
                    let html = '';
                    encontrados.forEach((v, idx) => {
                        const ubic = v.zona ? v.zona + '(' + v.columna + ',' + v.fila + ')' : '-';
                        html += '<div style="background: #2d2d2d; padding: 12px; margin: 8px 0; border-radius: 4px; border: 1px solid #d4af37; cursor: pointer; text-align: center;" onclick="seleccionarUbicacion(' + idx + ', ' + v.id + ')">';
                        html += '<div style="font-size: 1.1em; font-weight: 600; color: #d4af37; margin-bottom: 4px;">' + ubic + '</div>';
                        html += '<div style="font-size: 0.85em; color: #a8a8a8;">ID: ' + v.id + '</div>';
                        html += '</div>';
                    });
                    ubicList.innerHTML = html;
                    ubicDisp.style.display = 'block';
                } else if (encontrados.length === 1) {
                    // Si hay una sola, seleccionarla automáticamente
                    seleccionarUbicacion(0, encontrados[0].id);
                    ubicDisp.style.display = 'none';
                }
            }
            vi.style.display = 'block';
        }
        
        function seleccionarUbicacion(idx, vinoId) {
            vinoActual.id = vinoId;
            document.getElementById('ubicacionesList').innerHTML = '<div style="background: rgba(74, 124, 89, 0.2); padding: 15px; border-radius: 4px; border-left: 4px solid #4a7c59; text-align: center;"><div style="color: #6bc976; font-weight: 600; font-size: 1.05em;">✓ Ubicación seleccionada: ' + vinoId + '</div></div>';
            document.getElementById('cantidadDiv').style.display = 'block';
        }

        async function registrarMovimiento() {
            if (!vinoActual || !vinoActual.id) { alert('Selecciona una ubicación primero'); return; }
            const t = document.getElementById('movTipo').value;
            
            const tiposMap = { consumo: 'Consumo', venta: 'Venta', dano: 'Daño', perdida: 'Pérdida' };
            
            try {
                await fetch('/api/movimiento/' + vinoActual.id, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tipo: t })
                });
                
                document.getElementById('movMsg').innerHTML = '<div class="msg ok">✅ Movimiento registrado</div>';
                document.getElementById('qrBusca').value = '';
                document.getElementById('vinoInfo').style.display = 'none';
                document.getElementById('ubicacionesDisponibles').style.display = 'none';
                document.getElementById('cantidadDiv').style.display = 'none';
                document.getElementById('movRazon').value = '';
                vinoActual = null;
            } catch (err) {
                document.getElementById('movMsg').innerHTML = '<div class="msg err">❌ Error al registrar</div>';
            }
        }

        async function buscarVinos() {
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

        async function cargarInventario() {
            const res = await fetch('/api/buscar').then(r => r.json());
            
            // Obtener valores de filtros
            const filtroNombre = document.getElementById('filtroNombre').value.toLowerCase();
            const filtroTipo = document.getElementById('filtroTipo').value;
            const filtroEstado = document.getElementById('filtroEstado').value;
            
            // Aplicar filtros
            const filtrados = res.filter(r => {
                const cumpleNombre = !filtroNombre || r.nombre_vino.toLowerCase().includes(filtroNombre) || r.bodega.toLowerCase().includes(filtroNombre);
                const cumpleTipo = !filtroTipo || r.tipo_nombre === filtroTipo;
                const cumpleEstado = !filtroEstado || (r.estado || 'Disponible') === filtroEstado;
                return cumpleNombre && cumpleTipo && cumpleEstado;
            });
            
            // Construir tabla
            let html = '<table><tr><th>Vino</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th><th>Estado</th></tr>';
            if (filtrados.length === 0) {
                html += '<tr><td colspan="6" style="text-align:center; color:#f44336;">No hay resultados con los filtros aplicados</td></tr>';
            } else {
                filtrados.forEach(r => {
                    const ub = r.zona ? r.zona + '(' + r.columna + ',' + r.fila + ')' : '-';
                    const estado = r.estado || 'Disponible';
                    let colorEstado = '#6bc976';
                    let bgEstado = 'rgba(74,124,89,0.2)';
                    if (estado === 'Consumido' || estado === 'Vendido') {
                        colorEstado = '#a8a8a8';
                        bgEstado = 'rgba(168,168,168,0.1)';
                    } else if (estado === 'Dañado' || estado === 'Perdido') {
                        colorEstado = '#ff6b6b';
                        bgEstado = 'rgba(201,76,76,0.2)';
                    }
                    html += '<tr><td>' + r.nombre_vino + '</td><td>' + r.bodega + '</td><td>' + r.ano + '</td><td>' + (r.tipo_nombre || '-') + '</td><td>' + ub + '</td><td style="color:' + colorEstado + '; font-weight:bold; padding:10px; border-radius:4px; background:' + bgEstado + ';">' + estado + '</td></tr>';
                });
            }
            html += '</table>';
            html = '<div class="info" style="margin-bottom:15px;">Resultados: ' + filtrados.length + ' de ' + res.length + '</div>' + html;
            document.getElementById('invTable').innerHTML = html;
        }
        
        async function limpiarFiltros() {
            document.getElementById('filtroNombre').value = '';
            document.getElementById('filtroTipo').value = '';
            document.getElementById('filtroEstado').value = '';
            await cargarInventario();
        }

        async function escanearVino() {
            const code = document.getElementById('scanCode').value.trim();
            if (!code) return;
            const res = await fetch('/api/vinos/qr/' + code).then(r => r.json());
            let html = '';
            if (res.error) {
                html = '<div class="msg err">❌ NO ENCONTRADO</div>';
            } else {
                const ub = res.zona ? res.zona + '(' + res.columna + ',' + res.fila + ')' : '-';
                html = '<div class="msg ok">' + res.nombre_vino + ' - ' + res.bodega + ' (' + res.ano + ') | ' + ub + '</div>';
            }
            document.getElementById('scanRes').innerHTML = html;
        }

        async function inicializarBD() {
            await fetch('/setup');
            document.getElementById('adminMsg').innerHTML = '<div class="msg ok">✅ BD INICIALIZADA</div>';
            setTimeout(() => location.reload(), 2000);
        }

        async function addPais() {
            const n = document.getElementById('newPais').value.trim();
            const c = document.getElementById('newCodia').value.trim();
            if (!n || !c) return alert('Completa nombre y código ISO');
            const res = await fetch('/api/agregar-pais', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ nombre: n, codigo_iso: c })
            }).then(r => r.json());
            const el = document.getElementById('paisMsg');
            if (res.error) {
                el.innerHTML = '<div class="msg err">❌ ' + res.error + '</div>';
            } else {
                el.innerHTML = '<div class="msg ok">✅ País agregado</div>';
                document.getElementById('newPais').value = '';
                document.getElementById('newCodia').value = '';
            }
        }

        async function addVar() {
            const n = document.getElementById('newVar').value.trim();
            if (!n) return alert('Ingresa nombre de variedad');
            const res = await fetch('/api/agregar-variedad', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ nombre: n })
            }).then(r => r.json());
            const el = document.getElementById('varMsg');
            if (res.error) {
                el.innerHTML = '<div class="msg err">❌ ' + res.error + '</div>';
            } else {
                el.innerHTML = '<div class="msg ok">✅ Variedad agregada</div>';
                document.getElementById('newVar').value = '';
                allVars.push({ id: res.variedad.id, nombre: res.variedad.nombre });
            }
        }

        async function addReg() {
            const pid = document.getElementById('regPais').value;
            const n = document.getElementById('newRegNombre').value.trim();
            if (!pid || !n) return alert('Selecciona país e ingresa región');
            const res = await fetch('/api/agregar-region', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ pais_id: pid, nombre: n })
            }).then(r => r.json());
            const el = document.getElementById('regMsg');
            if (res.error) {
                el.innerHTML = '<div class="msg err">❌ ' + res.error + '</div>';
            } else {
                el.innerHTML = '<div class="msg ok">✅ Región agregada</div>';
                document.getElementById('newRegNombre').value = '';
            }
        }

        window.onload = inicializar;
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server on port ' + PORT));
