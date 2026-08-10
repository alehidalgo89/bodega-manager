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
        await pool.query('CREATE TABLE IF NOT EXISTS paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, codigo_iso VARCHAR(2))');
        await pool.query('CREATE TABLE IF NOT EXISTS regiones (id SERIAL PRIMARY KEY, pais_id INTEGER REFERENCES paises(id) ON DELETE CASCADE, nombre VARCHAR(100), UNIQUE(pais_id, nombre))');
        await pool.query('CREATE TABLE IF NOT EXISTS tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE IF NOT EXISTS zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(5) NOT NULL UNIQUE, columnas INTEGER, filas INTEGER)');
        await pool.query('CREATE TABLE IF NOT EXISTS ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE, columna INTEGER, fila INTEGER, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))');
        await pool.query('CREATE TABLE IF NOT EXISTS vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) UNIQUE, tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150), ano INTEGER, ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL, estado VARCHAR(20) DEFAULT "Disponible", fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)');
        await pool.query('CREATE TABLE IF NOT EXISTS movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(50), razon TEXT, notas TEXT, fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');

        await pool.query('DELETE FROM movimientos');
        await pool.query('DELETE FROM vinos');
        await pool.query('DELETE FROM ubicaciones');
        await pool.query('DELETE FROM zonas');
        await pool.query('DELETE FROM regiones');
        await pool.query('DELETE FROM paises');
        await pool.query('DELETE FROM tipos_vino');

        await pool.query('INSERT INTO tipos_vino (nombre) VALUES (\'Tinto\'), (\'Blanco\'), (\'Rosado\'), (\'Espumante\'), (\'Champagne\')');
        
        await pool.query('INSERT INTO paises (nombre, codigo_iso) VALUES (\'Francia\', \'FR\'), (\'Italia\', \'IT\'), (\'España\', \'ES\'), (\'Austria\', \'AT\'), (\'Croacia\', \'HR\'), (\'Alemania\', \'DE\'), (\'Portugal\', \'PT\'), (\'Argentina\', \'AR\'), (\'Chile\', \'CL\'), (\'Australia\', \'AU\'), (\'Sudáfrica\', \'ZA\'), (\'Nueva Zelanda\', \'NZ\'), (\'Estados Unidos\', \'US\'), (\'Hungría\', \'HU\'), (\'Rumania\', \'RO\')');

        await pool.query('INSERT INTO regiones (pais_id, nombre) VALUES ((SELECT id FROM paises WHERE codigo_iso = \'FR\'), \'Champagne\'), ((SELECT id FROM paises WHERE codigo_iso = \'FR\'), \'Bordeaux\'), ((SELECT id FROM paises WHERE codigo_iso = \'IT\'), \'Toscana\'), ((SELECT id FROM paises WHERE codigo_iso = \'IT\'), \'Piamonte\'), ((SELECT id FROM paises WHERE codigo_iso = \'ES\'), \'Rioja\'), ((SELECT id FROM paises WHERE codigo_iso = \'AR\'), \'Mendoza\'), ((SELECT id FROM paises WHERE codigo_iso = \'US\'), \'Napa Valley\')');

        await pool.query('INSERT INTO zonas (nombre, columnas, filas) VALUES (\'A1\', 20, 20), (\'A2\', 20, 20), (\'B1\', 30, 20), (\'B2\', 30, 20), (\'C1\', 30, 20), (\'C2\', 30, 20), (\'D1\', 20, 20), (\'D2\', 20, 20)');

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

        res.json({ success: true, message: 'Base de datos inicializada' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ========== API ENDPOINTS ==========
app.get('/api/paises', async (req, res) => {
    const result = await pool.query('SELECT * FROM paises ORDER BY nombre').catch(e => res.json([]));
    res.json(result ? result.rows : []);
});

app.get('/api/paises/:id/regiones', async (req, res) => {
    const result = await pool.query('SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre', [req.params.id]).catch(e => res.json([]));
    res.json(result ? result.rows : []);
});

app.get('/api/tipos-vino', async (req, res) => {
    const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre').catch(e => res.json([]));
    res.json(result ? result.rows : []);
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

app.post('/api/vinos', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, notas } = req.body;
        
        if (!tipo_vino_id || !pais_id || !bodega || !ano || !cantidad) {
            return res.json({ error: 'Datos requeridos faltantes' });
        }

        await client.query('BEGIN');
        
        const disp = await client.query('SELECT COUNT(*) as total FROM ubicaciones WHERE disponible = true');
        const cantDisp = parseInt(disp.rows[0].total);
        const cantReq = parseInt(cantidad);
        
        if (cantDisp < cantReq) {
            await client.query('ROLLBACK');
            return res.json({ error: 'No hay ' + cantReq + ' ubicaciones. Disponibles: ' + cantDisp });
        }

        const vinos = [];
        
        for (let i = 0; i < cantReq; i++) {
            const codigo_qr = crypto.randomBytes(16).toString('hex');
            
            const ub = await client.query('SELECT u.id, u.zona_id, u.columna, u.fila, z.nombre as zona_nombre FROM ubicaciones u LEFT JOIN zonas z ON u.zona_id = z.id WHERE u.disponible = true LIMIT 1 FOR UPDATE');
            
            if (ub.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.json({ error: 'Sin ubicaciones disponibles' });
            }
            
            const ub1 = ub.rows[0];
            
            const result = await client.query('INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id, notas) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, ub1.id, notas]);
            
            await client.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ub1.id]);
            
            await client.query('INSERT INTO movimientos (vino_id, tipo_movimiento, razon) VALUES ($1, $2, $3)', [result.rows[0].id, 'Entrada', 'Registro inicial']);
            
            vinos.push({
                id: result.rows[0].id,
                codigo_qr: result.rows[0].codigo_qr,
                ubicacion: {
                    zona: ub1.zona_nombre || 'Z' + ub1.zona_id,
                    columna: ub1.columna,
                    fila: ub1.fila,
                    referencia: (ub1.zona_nombre || 'Z' + ub1.zona_id) + '-' + ub1.columna + '-' + ub1.fila
                }
            });
        }
        
        await client.query('COMMIT');
        
        res.json({ 
            success: true, 
            message: cantReq + ' botella(s) registrada(s)',
            vinos: vinos,
            disponiblesRestantes: cantDisp - cantReq
        });
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
        const result = await pool.query('SELECT m.*, v.bodega, v.ano FROM movimientos m JOIN vinos v ON m.vino_id = v.id ORDER BY m.fecha_movimiento DESC LIMIT 200');
        res.json(result.rows);
    } catch (err) {
        res.json([]);
    }
});

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total = await pool.query('SELECT COUNT(*) as total FROM vinos');
        const por_tipo = await pool.query('SELECT tv.nombre, COUNT(*) as total FROM tipos_vino tv LEFT JOIN vinos v ON tv.id = v.tipo_vino_id GROUP BY tv.nombre ORDER BY total DESC');
        
        res.json({ 
            total_botellas: total.rows[0].total,
            por_tipo: por_tipo.rows
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ========== HTML ==========
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
        .warning-box { background: #ff9800; padding: 10px; margin: 10px 0; border-radius: 3px; }
        table { width: 100%; margin-top: 15px; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #444; }
        th { background: rgba(212,175,55,0.2); color: #D4AF37; }
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
            <button class="tab-btn" onclick="showTab('admin')">⚙️ Admin</button>
        </div>

        <div id="movimientos" class="tab-content active">
            <h2>🔄 Movimientos de Vino</h2>
            <label>Tipo de Movimiento</label>
            <select id="tipoMov" onchange="cambiarMovimiento()">
                <option value="">- Seleccionar -</option>
                <option value="Entrada">📥 Entrada (Registrar nuevas botellas)</option>
                <option value="Consumo">🍷 Consumo (Se bebió)</option>
                <option value="Venta">💰 Venta (Se vendió)</option>
                <option value="Daño">⚠️ Daño (Botella dañada)</option>
                <option value="Pérdida">❌ Pérdida (No se encontró)</option>
            </select>

            <div id="formEntrada" style="display:none;">
                <h3>📥 Registrar Entrada</h3>
                <div class="info-box" id="disponibilidadInfo">Cargando...</div>
                <label>Tipo de Vino</label>
                <select id="tipoVino"></select>
                <label>País</label>
                <select id="pais" onchange="cargarRegiones()"></select>
                <label>Región</label>
                <select id="region"></select>
                <label>Bodega</label>
                <input id="bodega" type="text">
                <label>Año</label>
                <input id="ano" type="number" min="1900">
                <label>Cantidad de Botellas</label>
                <input id="cantidad" type="number" min="1" value="1" onchange="validarCantidad()">
                <div id="advertenciaCapacidad" style="display:none;" class="warning-box"></div>
                <label>Notas</label>
                <textarea id="notasEntrada" rows="3"></textarea>
                <button onclick="registrarEntrada()">Registrar Entrada</button>
                <div id="resEntrada" class="result" style="display:none;"></div>
            </div>

            <div id="formMov" style="display:none;">
                <h3 id="titMov"></h3>
                <label>Código QR</label>
                <input id="codigoQR" type="text">
                <button onclick="buscarVino()">Buscar</button>
                <div id="infoVino" style="display:none; background: rgba(76,175,80,0.1); padding: 10px; margin: 10px 0; border-left: 4px solid #4CAF50;"></div>
                <label>Razón</label>
                <textarea id="razonMov" rows="3"></textarea>
                <label>Notas</label>
                <textarea id="notasMov" rows="2"></textarea>
                <button onclick="registrarMovimiento()">Registrar</button>
                <div id="resMov" class="result" style="display:none;"></div>
            </div>

            <hr style="margin: 30px 0; border: 1px solid #444;">
            <h3>Historial</h3>
            <button onclick="cargarHistorial()">Cargar Historial</button>
            <div id="historial"></div>
        </div>

        <div id="inventario" class="tab-content">
            <h2>📚 Inventario</h2>
            <button onclick="cargarInventario()">Cargar Inventario</button>
            <div id="tablaInventario"></div>
        </div>

        <div id="scanner" class="tab-content">
            <h2>📱 Scanner QR</h2>
            <label>Escanea código QR</label>
            <input id="codigoQRScan" type="text" autofocus>
            <button onclick="buscarQR()">Buscar</button>
            <div id="resScanner" class="result" style="display:none;"></div>
        </div>

        <div id="reportes" class="tab-content">
            <h2>📊 Reportes</h2>
            <button onclick="cargarReportes()">Cargar Reportes</button>
            <div id="tablaReportes"></div>
        </div>

        <div id="admin" class="tab-content">
            <h2>⚙️ Administración</h2>
            <button onclick="inicializarBD()">Inicializar Base de Datos</button>
            <div id="resAdmin" class="result" style="display:none;"></div>
        </div>
    </div>

    <script>
        let vinoActual = null;

        function showTab(tab) {
            document.querySelectorAll('.tab-content').forEach(e => e.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(e => e.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            event.target.classList.add('active');
        }

        function msg(id, text, error) {
            const el = document.getElementById(id);
            el.innerHTML = text;
            el.className = 'result ' + (error ? 'error' : '');
            el.style.display = 'block';
        }

        async function cargarDisponibilidad() {
            const data = await fetch('/api/disponibilidad').then(r => r.json()).catch(() => null);
            if (data && data.disponibles !== undefined) {
                document.getElementById('disponibilidadInfo').innerHTML = 'Disponibles: <strong>' + data.disponibles + '</strong> | Ocupados: <strong>' + data.ocupadas + '</strong> | Total: <strong>' + data.total + '</strong> (' + data.porcentajeOcupado + '%)';
            }
        }

        function validarCantidad() {
            const cantidad = parseInt(document.getElementById('cantidad').value);
            fetch('/api/disponibilidad').then(r => r.json()).then(data => {
                const adv = document.getElementById('advertenciaCapacidad');
                if (cantidad > data.disponibles) {
                    adv.innerHTML = 'Advertencia: Solo hay ' + data.disponibles + ' espacios, pero intentas guardar ' + cantidad;
                    adv.style.display = 'block';
                } else {
                    adv.style.display = 'none';
                }
            });
        }

        async function cargarDatos() {
            const tipos = await fetch('/api/tipos-vino').then(r => r.json());
            const paises = await fetch('/api/paises').then(r => r.json());
            
            document.getElementById('tipoVino').innerHTML += tipos.map(t => '<option value="' + t.id + '">' + t.nombre + '</option>').join('');
            document.getElementById('pais').innerHTML += paises.map(p => '<option value="' + p.id + '">' + p.nombre + '</option>').join('');
            
            cargarDisponibilidad();
        }

        async function cargarRegiones() {
            const paisId = document.getElementById('pais').value;
            if (!paisId) return;
            const regiones = await fetch('/api/paises/' + paisId + '/regiones').then(r => r.json());
            document.getElementById('region').innerHTML = '<option value="">-</option>' + regiones.map(r => '<option value="' + r.id + '">' + r.nombre + '</option>').join('');
        }

        function cambiarMovimiento() {
            const tipo = document.getElementById('tipoMov').value;
            document.getElementById('formEntrada').style.display = tipo === 'Entrada' ? 'block' : 'none';
            document.getElementById('formMov').style.display = tipo && tipo !== 'Entrada' ? 'block' : 'none';
            if (tipo && tipo !== 'Entrada') {
                document.getElementById('titMov').textContent = tipo;
                document.getElementById('codigoQR').value = '';
                document.getElementById('infoVino').style.display = 'none';
                vinoActual = null;
            }
            if (tipo === 'Entrada') cargarDisponibilidad();
        }

        async function registrarEntrada() {
            const datos = {
                tipo_vino_id: document.getElementById('tipoVino').value,
                pais_id: document.getElementById('pais').value,
                region_id: document.getElementById('region').value,
                bodega: document.getElementById('bodega').value,
                ano: document.getElementById('ano').value,
                cantidad: document.getElementById('cantidad').value,
                notas: document.getElementById('notasEntrada').value
            };

            if (!datos.tipo_vino_id || !datos.pais_id || !datos.bodega || !datos.ano) {
                msg('resEntrada', 'Completa campos requeridos', true);
                return;
            }

            const res = await fetch('/api/vinos', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(datos) }).then(r => r.json());
            
            if (res.success) {
                let html = '<strong style="color: #4CAF50;">✅ ' + res.message + '</strong><br><strong style="color: #ff9800;">Restantes: ' + res.disponiblesRestantes + '</strong><br>';
                res.vinos.forEach((v, i) => {
                    html += '<div style="background: rgba(76,175,80,0.15); padding: 15px; margin: 10px 0; border-radius: 3px;"><strong>Botella ' + (i+1) + ':</strong><br>📍 ' + v.ubicacion.zona + ' (Col: ' + v.ubicacion.columna + ', Fila: ' + v.ubicacion.fila + ')<br>QR: <code style="background: #333; padding: 3px;">' + v.codigo_qr + '</code></div>';
                });
                msg('resEntrada', html);
                cargarDisponibilidad();
                document.getElementById('formEntrada').querySelectorAll('input, select, textarea').forEach(e => e.value = '');
                document.getElementById('cantidad').value = '1';
            } else {
                msg('resEntrada', res.error, true);
            }
        }

        async function buscarVino() {
            const codigo = document.getElementById('codigoQR').value.trim();
            if (!codigo) { msg('resMov', 'Ingresa código', true); return; }
            const vino = await fetch('/api/vinos/qr/' + codigo).then(r => r.json());
            if (vino.error) {
                msg('resMov', vino.error, true);
                document.getElementById('infoVino').style.display = 'none';
            } else {
                vinoActual = vino;
                const ub = vino.zona_nombre ? '<strong>' + vino.zona_nombre + '</strong> (Col: ' + vino.columna + ', Fila: ' + vino.fila + ')' : '-';
                document.getElementById('infoVino').innerHTML = vino.bodega + ' (' + vino.ano + ') - ' + ub;
                document.getElementById('infoVino').style.display = 'block';
            }
        }

        async function registrarMovimiento() {
            if (!vinoActual) { msg('resMov', 'Busca un vino primero', true); return; }
            const res = await fetch('/api/vinos/' + vinoActual.id + '/movimiento', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ tipo_movimiento: document.getElementById('tipoMov').value, razon: document.getElementById('razonMov').value, notas: document.getElementById('notasMov').value })
            }).then(r => r.json());
            if (res.success) {
                msg('resMov', res.message);
                document.getElementById('codigoQR').value = '';
                document.getElementById('infoVino').style.display = 'none';
                vinoActual = null;
            } else {
                msg('resMov', res.error, true);
            }
        }

        async function cargarHistorial() {
            const movs = await fetch('/api/movimientos').then(r => r.json());
            let html = '<table><tr><th>Fecha</th><th>Bodega</th><th>Movimiento</th></tr>';
            movs.forEach(m => {
                const fecha = new Date(m.fecha_movimiento).toLocaleString();
                html += '<tr><td>' + fecha + '</td><td>' + m.bodega + '</td><td>' + m.tipo_movimiento + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('historial').innerHTML = html;
        }

        async function cargarInventario() {
            const vinos = await fetch('/api/vinos').then(r => r.json());
            let html = '<table><tr><th>Bodega</th><th>Año</th><th>Tipo</th><th>Ubicación</th></tr>';
            vinos.forEach(v => {
                const ub = v.zona_nombre ? '<strong>' + v.zona_nombre + '</strong> (' + v.columna + ',' + v.fila + ')' : '-';
                html += '<tr><td>' + v.bodega + '</td><td>' + v.ano + '</td><td>' + (v.tipo_nombre || '-') + '</td><td>' + ub + '</td></tr>';
            });
            html += '</table>';
            document.getElementById('tablaInventario').innerHTML = html;
        }

        async function buscarQR() {
            const codigo = document.getElementById('codigoQRScan').value.trim();
            if (!codigo) return;
            const vino = await fetch('/api/vinos/qr/' + codigo).then(r => r.json());
            if (vino.error) {
                msg('resScanner', vino.error, true);
            } else {
                const ub = vino.zona_nombre ? '<strong>' + vino.zona_nombre + '</strong> (' + vino.columna + ',' + vino.fila + ')' : '-';
                msg('resScanner', vino.bodega + ' (' + vino.ano + ')<br>Ubicación: ' + ub);
            }
        }

        async function cargarReportes() {
            const data = await fetch('/api/reportes/resumen').then(r => r.json());
            let html = '<p><strong>Total Botellas:</strong> ' + data.total_botellas + '</p>';
            if (data.por_tipo && data.por_tipo.length > 0) {
                html += '<table><tr><th>Tipo</th><th>Cantidad</th></tr>';
                data.por_tipo.forEach(t => html += '<tr><td>' + t.nombre + '</td><td>' + t.total + '</td></tr>');
                html += '</table>';
            }
            document.getElementById('tablaReportes').innerHTML = html;
        }

        async function inicializarBD() {
            const res = await fetch('/setup').then(r => r.json());
            if (res.success) {
                msg('resAdmin', res.message);
            } else {
                msg('resAdmin', res.error, true);
            }
        }

        window.onload = cargarDatos;
    </script>
</body>
</html>`;

app.get('/', (req, res) => res.send(html));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
