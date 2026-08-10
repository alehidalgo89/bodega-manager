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

// ============================================
// SETUP INICIAL
// ============================================

app.get('/setup', async (req, res) => {
    try {
        console.log('Inicializando base de datos...');

        // Crear tablas
        await pool.query(`CREATE TABLE IF NOT EXISTS paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE, codigo_iso VARCHAR(2))`);
        await pool.query(`CREATE TABLE IF NOT EXISTS regiones (id SERIAL PRIMARY KEY, pais_id INTEGER NOT NULL REFERENCES paises(id) ON DELETE CASCADE, nombre VARCHAR(100) NOT NULL, UNIQUE(pais_id, nombre))`);
        await pool.query(`CREATE TABLE IF NOT EXISTS tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(5) NOT NULL UNIQUE, columnas INTEGER NOT NULL, filas INTEGER NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER NOT NULL REFERENCES zonas(id) ON DELETE CASCADE, columna INTEGER NOT NULL, fila INTEGER NOT NULL, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))`);
        await pool.query(`CREATE TABLE IF NOT EXISTS vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) NOT NULL UNIQUE, tipo_vino_id INTEGER NOT NULL REFERENCES tipos_vino(id), pais_id INTEGER NOT NULL REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150) NOT NULL, ano INTEGER NOT NULL, cantidad INTEGER NOT NULL DEFAULT 1, cantidad_minima INTEGER DEFAULT 0, ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL, estado VARCHAR(20) DEFAULT 'Disponible', fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER NOT NULL REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(20) NOT NULL, cantidad INTEGER NOT NULL, fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)`);

        // Limpiar datos previos EN ORDEN CORRECTO
        await pool.query('DELETE FROM movimientos');
        await pool.query('DELETE FROM vinos');
        await pool.query('DELETE FROM ubicaciones');
        await pool.query('DELETE FROM zonas');
        await pool.query('DELETE FROM regiones');
        await pool.query('DELETE FROM paises');
        await pool.query('DELETE FROM tipos_vino');

        // Insertar tipos de vino
        await pool.query(`INSERT INTO tipos_vino (nombre) VALUES ('Tinto'), ('Blanco'), ('Rosado'), ('Espumante'), ('Champagne') ON CONFLICT DO NOTHING`);

        // Insertar países
        const paises_sql = `INSERT INTO paises (nombre, codigo_iso) VALUES
            ('Francia', 'FR'), ('Italia', 'IT'), ('España', 'ES'), ('Austria', 'AT'), ('Croacia', 'HR'),
            ('Alemania', 'DE'), ('Portugal', 'PT'), ('Argentina', 'AR'), ('Chile', 'CL'), ('Australia', 'AU'),
            ('Sudáfrica', 'ZA'), ('Nueva Zelanda', 'NZ'), ('Estados Unidos', 'US'), ('Hungría', 'HU'), ('Rumania', 'RO')
            ON CONFLICT DO NOTHING`;
        await pool.query(paises_sql);

        // Insertar regiones
        const regiones_sql = `INSERT INTO regiones (pais_id, nombre) VALUES
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Champagne'),
            ((SELECT id FROM paises WHERE codigo_iso = 'FR'), 'Bordeaux'),
            ((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Toscana'),
            ((SELECT id FROM paises WHERE codigo_iso = 'IT'), 'Piamonte'),
            ((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Rioja'),
            ((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Ribera del Duero'),
            ((SELECT id FROM paises WHERE codigo_iso = 'AT'), 'Wachau'),
            ((SELECT id FROM paises WHERE codigo_iso = 'AR'), 'Mendoza'),
            ((SELECT id FROM paises WHERE codigo_iso = 'CL'), 'Maipo'),
            ((SELECT id FROM paises WHERE codigo_iso = 'US'), 'Napa Valley')
            ON CONFLICT DO NOTHING`;
        await pool.query(regiones_sql);

        // Insertar zonas
        await pool.query(`INSERT INTO zonas (nombre, columnas, filas) VALUES
            ('A1', 20, 20), ('A2', 20, 20), ('B1', 30, 20), ('B2', 30, 20),
            ('C1', 30, 20), ('C2', 30, 20), ('D1', 20, 20), ('D2', 20, 20)
            ON CONFLICT DO NOTHING`);

        // Generar ubicaciones
        const zonas_config = [
            { nombre: 'A1', cols: 20 }, { nombre: 'A2', cols: 20 }, { nombre: 'B1', cols: 30 }, { nombre: 'B2', cols: 30 },
            { nombre: 'C1', cols: 30 }, { nombre: 'C2', cols: 30 }, { nombre: 'D1', cols: 20 }, { nombre: 'D2', cols: 20 }
        ];

        for (const zona of zonas_config) {
            const zr = await pool.query('SELECT id FROM zonas WHERE nombre = $1', [zona.nombre]);
            if (zr.rows.length > 0) {
                for (let c = 1; c <= zona.cols; c++) {
                    for (let f = 1; f <= 20; f++) {
                        await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [zr.rows[0].id, c, f]);
                    }
                }
            }
        }

        res.json({ success: true, message: 'Base de datos inicializada correctamente', detalles: { tablas: 8, paises: 15, ubicaciones: 4000 } });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/paises/:id/regiones', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre', [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/tipos-vino', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
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

app.get('/api/vinos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT v.*, tv.nombre as tipo_nombre, p.nombre as pais_nombre, 
                   r.nombre as region_nombre, z.nombre as zona_nombre, u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            ORDER BY v.bodega, v.ano DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/vinos', async (req, res) => {
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, notas } = req.body;
        const codigo_qr = crypto.randomBytes(16).toString('hex');
        
        const ub = await pool.query('SELECT id FROM ubicaciones WHERE disponible = true LIMIT 1');
        if (ub.rows.length === 0) return res.json({ error: 'No hay ubicaciones disponibles' });
        
        const ubicacion_id = ub.rows[0].id;
        const result = await pool.query(
            `INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, ubicacion_id, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, cantidad || 1, ubicacion_id, notas]
        );
        
        await pool.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ubicacion_id]);
        await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad) VALUES ($1, $2, $3)',
            [result.rows[0].id, 'Entrada', cantidad || 1]);
        
        res.json({ success: true, vino: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total = await pool.query('SELECT COALESCE(SUM(cantidad), 0) as total FROM vinos');
        const por_tipo = await pool.query(`
            SELECT tv.nombre, COALESCE(SUM(v.cantidad), 0) as total
            FROM tipos_vino tv
            LEFT JOIN vinos v ON tv.id = v.tipo_vino_id
            GROUP BY tv.nombre ORDER BY total DESC
        `);
        const por_pais = await pool.query(`
            SELECT p.nombre, COALESCE(SUM(v.cantidad), 0) as total
            FROM paises p
            LEFT JOIN vinos v ON p.id = v.pais_id
            GROUP BY p.nombre ORDER BY total DESC LIMIT 10
        `);
        
        res.json({ total_botellas: total.rows[0].total, por_tipo: por_tipo.rows, por_pais: por_pais.rows });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ============================================
// PÁGINA PRINCIPAL (HTML/CSS/JS COMPLETO)
// ============================================

app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bodega de Candinho - Sistema de Inventario</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
            color: #fff;
            min-height: 100vh;
        }
        
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        
        header {
            background: rgba(0, 0, 0, 0.3);
            padding: 30px 0;
            border-bottom: 3px solid #D4AF37;
            margin-bottom: 30px;
            text-align: center;
        }
        
        h1 { font-size: 2.5em; color: #D4AF37; margin-bottom: 10px; }
        .subtitle { color: #b0b0b0; font-size: 1.1em; }
        
        .tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        
        .tab-btn {
            padding: 12px 24px;
            background: rgba(76, 175, 80, 0.8);
            border: none;
            color: white;
            cursor: pointer;
            border-radius: 5px;
            font-size: 1em;
            font-weight: bold;
            transition: all 0.3s;
        }
        
        .tab-btn:hover { background: #4CAF50; transform: translateY(-2px); }
        .tab-btn.active { background: #D4AF37; color: #000; }
        
        .tab-content {
            display: none;
            background: rgba(45, 45, 45, 0.9);
            padding: 30px;
            border-radius: 8px;
            border: 1px solid #444;
        }
        
        .tab-content.active { display: block; animation: fadeIn 0.3s; }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .form-group {
            margin-bottom: 20px;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            color: #D4AF37;
            font-weight: bold;
        }
        
        input, select, textarea {
            width: 100%;
            padding: 12px;
            background: #333;
            border: 1px solid #555;
            color: white;
            border-radius: 5px;
            font-size: 1em;
        }
        
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #D4AF37;
            box-shadow: 0 0 5px rgba(212, 175, 55, 0.3);
        }
        
        button {
            background: #4CAF50;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1em;
            font-weight: bold;
            transition: all 0.3s;
        }
        
        button:hover { background: #45a049; transform: translateY(-2px); }
        button:active { transform: translateY(0); }
        
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        
        .result {
            background: rgba(0, 0, 0, 0.3);
            padding: 20px;
            border-radius: 5px;
            margin-top: 20px;
            border-left: 4px solid #4CAF50;
            max-height: 400px;
            overflow-y: auto;
        }
        
        .result.error { border-left-color: #f44336; }
        .result.success { border-left-color: #4CAF50; }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #444;
        }
        
        th {
            background: rgba(212, 175, 55, 0.2);
            color: #D4AF37;
            font-weight: bold;
        }
        
        tr:hover { background: rgba(212, 175, 55, 0.1); }
        
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .stat-card {
            background: rgba(76, 175, 80, 0.1);
            border: 1px solid #4CAF50;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
        }
        
        .stat-value { font-size: 2.5em; color: #4CAF50; font-weight: bold; }
        .stat-label { color: #b0b0b0; margin-top: 10px; }
        
        .success-msg { color: #4CAF50; font-weight: bold; margin: 10px 0; }
        .error-msg { color: #f44336; font-weight: bold; margin: 10px 0; }
        
        @media (max-width: 768px) {
            h1 { font-size: 1.8em; }
            .form-row { grid-template-columns: 1fr; }
            .tabs { flex-direction: column; }
        }
    </style>
</head>
<body>
    <header>
        <h1>🍷 Bodega de Candinho</h1>
        <p class="subtitle">Sistema de Gestión de Inventario de Vinos</p>
    </header>

    <div class="container">
        <div class="tabs">
            <button class="tab-btn active" onclick="switchTab('entrada')">📥 Entrada de Vino</button>
            <button class="tab-btn" onclick="switchTab('inventario')">📚 Inventario</button>
            <button class="tab-btn" onclick="switchTab('buscar')">🔍 Buscar</button>
            <button class="tab-btn" onclick="switchTab('reportes')">📊 Reportes</button>
            <button class="tab-btn" onclick="switchTab('admin')">⚙️ Administración</button>
        </div>

        <!-- TAB: ENTRADA DE VINO -->
        <div id="entrada" class="tab-content active">
            <h2>Registro de Entrada de Vino</h2>
            
            <div class="form-group">
                <label>Tipo de Vino *</label>
                <select id="tipo_vino_id" required>
                    <option value="">-- Seleccionar --</option>
                </select>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>País *</label>
                    <select id="pais_id" required onchange="cargarRegiones()">
                        <option value="">-- Seleccionar --</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Región</label>
                    <select id="region_id">
                        <option value="">-- Seleccionar --</option>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Bodega/Productor *</label>
                    <input type="text" id="bodega" placeholder="Nombre de la bodega" required>
                </div>
                
                <div class="form-group">
                    <label>Año *</label>
                    <input type="number" id="ano" placeholder="2020" min="1900" max="2099" required>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Cantidad de Botellas *</label>
                    <input type="number" id="cantidad" placeholder="1" min="1" required>
                </div>
                
                <div class="form-group">
                    <label>Cantidad Mínima</label>
                    <input type="number" id="cantidad_minima" placeholder="0" min="0" value="0">
                </div>
            </div>

            <div class="form-group">
                <label>Notas</label>
                <textarea id="notas" placeholder="Observaciones adicionales..." rows="3"></textarea>
            </div>

            <button onclick="registrarVino()">Registrar Vino</button>
            <div id="resultado-entrada" class="result" style="display:none;"></div>
        </div>

        <!-- TAB: INVENTARIO -->
        <div id="inventario" class="tab-content">
            <h2>Inventario Completo</h2>
            <button onclick="cargarInventario()">Cargar Inventario</button>
            <div id="tabla-inventario"></div>
        </div>

        <!-- TAB: BUSCAR -->
        <div id="buscar" class="tab-content">
            <h2>Buscar Vino</h2>
            
            <div class="form-row">
                <div class="form-group">
                    <label>Buscar por Bodega</label>
                    <input type="text" id="buscar-bodega" placeholder="Nombre de la bodega">
                    <button onclick="buscarPorBodega()">Buscar</button>
                </div>
                
                <div class="form-group">
                    <label>Buscar por País</label>
                    <select id="buscar-pais" onchange="buscarPorPais()">
                        <option value="">-- Seleccionar --</option>
                    </select>
                </div>
            </div>

            <div id="resultados-busqueda"></div>
        </div>

        <!-- TAB: REPORTES -->
        <div id="reportes" class="tab-content">
            <h2>Reportes y Estadísticas</h2>
            <button onclick="cargarReportes()">Cargar Reportes</button>
            
            <div id="stats-container" class="stats"></div>
            <div id="tabla-reportes"></div>
        </div>

        <!-- TAB: ADMINISTRACIÓN -->
        <div id="admin" class="tab-content">
            <h2>Administración</h2>
            
            <div class="form-group">
                <h3>Configuración de Base de Datos</h3>
                <button onclick="inicializarBD()">Inicializar Base de Datos</button>
                <div id="resultado-admin" class="result" style="display:none;"></div>
            </div>
        </div>
    </div>

    <script>
        // Funciones principales
        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(tabName).classList.add('active');
            event.target.classList.add('active');
        }

        function mostrarResultado(elementId, mensaje, esError = false) {
            const el = document.getElementById(elementId);
            el.innerHTML = mensaje;
            el.className = 'result ' + (esError ? 'error' : 'success');
            el.style.display = 'block';
        }

        // Cargar datos iniciales
        async function cargarDatos() {
            try {
                const tipos = await fetch('/api/tipos-vino').then(r => r.json());
                const paises = await fetch('/api/paises').then(r => r.json());
                
                // Llenar selects
                const tipoSelect = document.getElementById('tipo_vino_id');
                tipos.forEach(t => {
                    tipoSelect.innerHTML += \`<option value="\${t.id}">\${t.nombre}</option>\`;
                });
                
                const paisSelect = document.getElementById('pais_id');
                paises.forEach(p => {
                    paisSelect.innerHTML += \`<option value="\${p.id}">\${p.nombre}</option>\`;
                });
                
                const paisBuscarSelect = document.getElementById('buscar-pais');
                paises.forEach(p => {
                    paisBuscarSelect.innerHTML += \`<option value="\${p.id}">\${p.nombre}</option>\`;
                });
            } catch (err) {
                console.error(err);
            }
        }

        async function cargarRegiones() {
            const paisId = document.getElementById('pais_id').value;
            if (!paisId) return;
            
            try {
                const regiones = await fetch(\`/api/paises/\${paisId}/regiones\`).then(r => r.json());
                const regionSelect = document.getElementById('region_id');
                regionSelect.innerHTML = '<option value="">-- Seleccionar --</option>';
                regiones.forEach(r => {
                    regionSelect.innerHTML += \`<option value="\${r.id}">\${r.nombre}</option>\`;
                });
            } catch (err) {
                console.error(err);
            }
        }

        async function registrarVino() {
            const datos = {
                tipo_vino_id: document.getElementById('tipo_vino_id').value,
                pais_id: document.getElementById('pais_id').value,
                region_id: document.getElementById('region_id').value,
                bodega: document.getElementById('bodega').value,
                ano: document.getElementById('ano').value,
                cantidad: document.getElementById('cantidad').value,
                notas: document.getElementById('notas').value
            };

            if (!datos.tipo_vino_id || !datos.pais_id || !datos.bodega || !datos.ano) {
                mostrarResultado('resultado-entrada', '❌ Por favor completa todos los campos requeridos (*)', true);
                return;
            }

            try {
                const response = await fetch('/api/vinos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(datos)
                });
                const result = await response.json();
                
                if (result.success) {
                    mostrarResultado('resultado-entrada', \`✅ Vino registrado exitosamente<br>Código QR: \${result.vino.codigo_qr.substring(0, 16)}...\`);
                    document.getElementById('entrada').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
                } else {
                    mostrarResultado('resultado-entrada', '❌ Error: ' + result.error, true);
                }
            } catch (err) {
                mostrarResultado('resultado-entrada', '❌ Error: ' + err.message, true);
            }
        }

        async function cargarInventario() {
            try {
                const vinos = await fetch('/api/vinos').then(r => r.json());
                
                if (!vinos || vinos.length === 0) {
                    document.getElementById('tabla-inventario').innerHTML = '<p style="color: #b0b0b0;">No hay vinos registrados</p>';
                    return;
                }

                let html = \`<table><thead><tr>
                    <th>Bodega</th><th>Tipo</th><th>País</th><th>Región</th>
                    <th>Año</th><th>Cantidad</th><th>Ubicación</th><th>Registrado</th>
                </tr></thead><tbody>\`;
                
                vinos.forEach(v => {
                    const fecha = new Date(v.fecha_ingreso).toLocaleDateString();
                    const ubicacion = v.zona_nombre ? \`\${v.zona_nombre} (\${v.columna},\${v.fila})\` : 'Sin ubicar';
                    html += \`<tr>
                        <td>\${v.bodega}</td>
                        <td>\${v.tipo_nombre || '-'}</td>
                        <td>\${v.pais_nombre || '-'}</td>
                        <td>\${v.region_nombre || '-'}</td>
                        <td>\${v.ano}</td>
                        <td>\${v.cantidad}</td>
                        <td>\${ubicacion}</td>
                        <td>\${fecha}</td>
                    </tr>\`;
                });
                
                html += '</tbody></table>';
                document.getElementById('tabla-inventario').innerHTML = html;
            } catch (err) {
                document.getElementById('tabla-inventario').innerHTML = '<p style="color: #f44336;">Error al cargar: ' + err.message + '</p>';
            }
        }

        async function cargarReportes() {
            try {
                const data = await fetch('/api/reportes/resumen').then(r => r.json());
                
                const statsHtml = \`
                    <div class="stat-card">
                        <div class="stat-value">\${data.total_botellas}</div>
                        <div class="stat-label">Botellas Totales</div>
                    </div>
                \`;
                
                document.getElementById('stats-container').innerHTML = statsHtml;
                
                let tablaHtml = '<h3>Por Tipo de Vino</h3><table><thead><tr><th>Tipo</th><th>Cantidad</th></tr></thead><tbody>';
                data.por_tipo.forEach(t => {
                    tablaHtml += \`<tr><td>\${t.nombre}</td><td>\${t.total}</td></tr>\`;
                });
                tablaHtml += '</tbody></table>';
                
                tablaHtml += '<h3 style="margin-top:30px;">Top 10 Países</h3><table><thead><tr><th>País</th><th>Cantidad</th></tr></thead><tbody>';
                data.por_pais.forEach(p => {
                    tablaHtml += \`<tr><td>\${p.nombre}</td><td>\${p.total}</td></tr>\`;
                });
                tablaHtml += '</tbody></table>';
                
                document.getElementById('tabla-reportes').innerHTML = tablaHtml;
            } catch (err) {
                document.getElementById('tabla-reportes').innerHTML = '<p style="color: #f44336;">Error al cargar reportes: ' + err.message + '</p>';
            }
        }

        async function buscarPorBodega() {
            const bodega = document.getElementById('buscar-bodega').value;
            if (!bodega) return;
            
            try {
                const vinos = await fetch('/api/vinos').then(r => r.json());
                const filtrados = vinos.filter(v => v.bodega.toLowerCase().includes(bodega.toLowerCase()));
                
                if (filtrados.length === 0) {
                    document.getElementById('resultados-busqueda').innerHTML = '<p style="color: #b0b0b0;">No se encontraron resultados</p>';
                    return;
                }

                let html = '<h3>Resultados encontrados</h3><table><thead><tr><th>Bodega</th><th>Tipo</th><th>Año</th><th>Cantidad</th><th>Ubicación</th></tr></thead><tbody>';
                filtrados.forEach(v => {
                    const ubicacion = v.zona_nombre ? \`\${v.zona_nombre} (\${v.columna},\${v.fila})\` : 'Sin ubicar';
                    html += \`<tr><td>\${v.bodega}</td><td>\${v.tipo_nombre}</td><td>\${v.ano}</td><td>\${v.cantidad}</td><td>\${ubicacion}</td></tr>\`;
                });
                html += '</tbody></table>';
                document.getElementById('resultados-busqueda').innerHTML = html;
            } catch (err) {
                document.getElementById('resultados-busqueda').innerHTML = '<p style="color: #f44336;">Error: ' + err.message + '</p>';
            }
        }

        async function buscarPorPais() {
            const paisId = document.getElementById('buscar-pais').value;
            if (!paisId) return;
            
            try {
                const vinos = await fetch('/api/vinos').then(r => r.json());
                const filtrados = vinos.filter(v => v.pais_id == paisId);
                
                if (filtrados.length === 0) {
                    document.getElementById('resultados-busqueda').innerHTML = '<p style="color: #b0b0b0;">No hay vinos de este país</p>';
                    return;
                }

                let html = '<h3>Vinos encontrados</h3><table><thead><tr><th>Bodega</th><th>Tipo</th><th>Año</th><th>Cantidad</th></tr></thead><tbody>';
                filtrados.forEach(v => {
                    html += \`<tr><td>\${v.bodega}</td><td>\${v.tipo_nombre}</td><td>\${v.ano}</td><td>\${v.cantidad}</td></tr>\`;
                });
                html += '</tbody></table>';
                document.getElementById('resultados-busqueda').innerHTML = html;
            } catch (err) {
                document.getElementById('resultados-busqueda').innerHTML = '<p style="color: #f44336;">Error: ' + err.message + '</p>';
            }
        }

        async function inicializarBD() {
            try {
                const response = await fetch('/setup');
                const result = await response.json();
                
                if (result.success) {
                    mostrarResultado('resultado-admin', \`✅ \${result.message}<br>Detalles: \${JSON.stringify(result.detalles).replace(/,/g, ', ')}\`);
                } else {
                    mostrarResultado('resultado-admin', '❌ Error: ' + result.error, true);
                }
            } catch (err) {
                mostrarResultado('resultado-admin', '❌ Error: ' + err.message, true);
            }
        }

        // Cargar datos al iniciar
        window.onload = cargarDatos;
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('Servidor Bodega de Candinho en puerto ' + PORT);
});
