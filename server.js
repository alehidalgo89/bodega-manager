const express = require('express');
const cors = require('cors');
const pg = require('pg');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
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
        await pool.query(`CREATE TABLE IF NOT EXISTS vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(255) NOT NULL UNIQUE, tipo_vino_id INTEGER NOT NULL REFERENCES tipos_vino(id), pais_id INTEGER NOT NULL REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(150) NOT NULL, ano INTEGER NOT NULL, ubicacion_id INTEGER REFERENCES ubicaciones(id) ON DELETE SET NULL, estado VARCHAR(20) DEFAULT 'Disponible', fecha_ingreso TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER NOT NULL REFERENCES vinos(id) ON DELETE CASCADE, tipo_movimiento VARCHAR(50) NOT NULL, cantidad INTEGER DEFAULT 1, razon TEXT, fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP, notas TEXT)`);


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
            ((SELECT id FROM paises WHERE codigo_iso = 'ES'), 'Ribiera del Duero'),
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

        res.json({ success: true, message: 'Base de datos inicializada correctamente', detalles: { tablas: 7, paises: 15, ubicaciones: 4000 } });
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
            LIMIT 500
        `);
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Buscar vino por código QR
app.get('/api/vinos/qr/:codigo', async (req, res) => {
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
            WHERE v.codigo_qr = $1
        `, [req.params.codigo]);
        
        if (result.rows.length === 0) {
            return res.json({ error: 'Botella no encontrada' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Registrar vino - AHORA CON CÓDIGO ÚNICO POR BOTELLA
app.post('/api/vinos', async (req, res) => {
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, notas } = req.body;
        
        if (!tipo_vino_id || !pais_id || !bodega || !ano || !cantidad) {
            return res.json({ error: 'Datos requeridos faltantes' });
        }

        const vinosCreados = [];
        
        // Crear UN VINO POR CADA BOTELLA
        for (let i = 0; i < parseInt(cantidad); i++) {
            const codigo_qr = crypto.randomBytes(16).toString('hex');
            
            const ub = await pool.query(`
                SELECT u.id, u.zona_id, u.columna, u.fila, z.nombre as zona_nombre
                FROM ubicaciones u
                LEFT JOIN zonas z ON u.zona_id = z.id
                WHERE u.disponible = true 
                LIMIT 1
            `);
            
            if (ub.rows.length === 0) {
                return res.json({ error: 'No hay ubicaciones disponibles' });
            }
            
            const ubicacion = ub.rows[0];
            const ubicacion_id = ubicacion.id;
            
            const result = await pool.query(
                `INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, ubicacion_id, notas)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
                [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, ubicacion_id, notas]
            );
            
            await pool.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ubicacion_id]);
            await pool.query('INSERT INTO movimientos (vino_id, tipo_movimiento) VALUES ($1, $2)',
                [result.rows[0].id, 'Entrada']);
            
            vinosCreados.push({
                id: result.rows[0].id,
                codigo_qr: result.rows[0].codigo_qr,
                ubicacion: {
                    zona: ubicacion.zona_nombre,
                    columna: ubicacion.columna,
                    fila: ubicacion.fila,
                    posicion: `${ubicacion.zona_nombre}-${ubicacion.columna}-${ubicacion.fila}`
                }
            });
        }
        
        res.json({ 
            success: true, 
            message: `${cantidad} botella(s) registrada(s) exitosamente`,
            vinos: vinosCreados
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Registrar movimiento de vino (salida, traslado, daño, etc)
app.post('/api/vinos/:id/movimiento', async (req, res) => {
    try {
        const { tipo_movimiento, razon, notas } = req.body;
        const vino_id = req.params.id;
        
        if (!tipo_movimiento) {
            return res.json({ error: 'Tipo de movimiento requerido' });
        }

        // Obtener vino actual
        const vino = await pool.query('SELECT * FROM vinos WHERE id = $1', [vino_id]);
        if (vino.rows.length === 0) {
            return res.json({ error: 'Vino no encontrado' });
        }

        // Definir nuevo estado según tipo de movimiento
        let nuevoEstado = 'Disponible';
        if (tipo_movimiento === 'Salida' || tipo_movimiento === 'Consumo' || tipo_movimiento === 'Venta') {
            nuevoEstado = 'Consumido';
        } else if (tipo_movimiento === 'Daño' || tipo_movimiento === 'Pérdida') {
            nuevoEstado = 'Dañado';
        }

        // Registrar movimiento
        const movimiento = await pool.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, razon, notas) VALUES ($1, $2, $3, $4) RETURNING *',
            [vino_id, tipo_movimiento, razon, notas]
        );

        // Actualizar estado del vino
        await pool.query('UPDATE vinos SET estado = $1 WHERE id = $2', [nuevoEstado, vino_id]);

        // Si fue salida, liberar ubicación
        if (tipo_movimiento === 'Salida' || tipo_movimiento === 'Consumo' || tipo_movimiento === 'Venta' || tipo_movimiento === 'Daño' || tipo_movimiento === 'Pérdida') {
            await pool.query('UPDATE ubicaciones SET disponible = true WHERE id = (SELECT ubicacion_id FROM vinos WHERE id = $1)', [vino_id]);
            await pool.query('UPDATE vinos SET ubicacion_id = NULL WHERE id = $1', [vino_id]);
        }

        res.json({ 
            success: true, 
            message: 'Movimiento registrado exitosamente',
            movimiento: movimiento.rows[0],
            nuevoEstado: nuevoEstado
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener historial de movimientos de un vino
app.get('/api/vinos/:id/historial', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, v.bodega, v.ano
            FROM movimientos m
            JOIN vinos v ON m.vino_id = v.id
            WHERE m.vino_id = $1
            ORDER BY m.fecha_movimiento DESC
        `, [req.params.id]);
        
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Obtener todos los movimientos
app.get('/api/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.*, v.bodega, v.ano, v.codigo_qr, tv.nombre as tipo_vino
            FROM movimientos m
            JOIN vinos v ON m.vino_id = v.id
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            ORDER BY m.fecha_movimiento DESC
            LIMIT 200
        `);
        
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});
app.get('/api/vinos/descargar-etiquetas/:bodega', async (req, res) => {
    try {
        const bodega = req.params.bodega;
        
        const vinos = await pool.query(`
            SELECT v.* FROM vinos v
            WHERE v.bodega = $1
            ORDER BY v.codigo_qr
        `, [bodega]);
        
        if (vinos.rows.length === 0) {
            return res.json({ error: 'No hay vinos de esta bodega' });
        }
        
        const doc = new PDFDocument({ size: 'A4', margin: 10 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="etiquetas-${bodega}.pdf"`);
        
        doc.pipe(res);
        
        doc.fontSize(16).font('Helvetica-Bold').text('Bodega de Candinho', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text(`Etiquetas QR - ${bodega}`, { align: 'center' });
        doc.moveDown();
        
        for (let i = 0; i < vinos.rows.length; i++) {
            const vino = vinos.rows[i];
            
            // Generar QR para esta botella
            const qrDataUrl = await QRCode.toDataURL(vino.codigo_qr, { 
                width: 120,
                errorCorrectionLevel: 'H'
            });
            
            // Crear recuadro para etiqueta
            doc.rect(15, doc.y, 180, 120).stroke();
            
            // Imagen QR
            doc.image(Buffer.from(qrDataUrl.split(',')[1], 'base64'), 20, doc.y + 5, { width: 50 });
            
            // Información
            doc.fontSize(8).font('Helvetica-Bold').text(`${vino.bodega}`, 75, doc.y, { width: 110 });
            doc.fontSize(7).font('Helvetica').text(`Año: ${vino.ano}`, 75, doc.y + 15, { width: 110 });
            doc.fontSize(7).text(`Código: ${vino.codigo_qr.substring(0, 16)}...`, 75, doc.y + 5, { width: 110 });
            
            doc.moveDown(7);
            
            // Salto de página cada 3 etiquetas
            if ((i + 1) % 3 === 0 && i < vinos.rows.length - 1) {
                doc.addPage();
            }
        }
        
        doc.end();
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total = await pool.query('SELECT COALESCE(COUNT(*), 0) as total FROM vinos');
        const por_tipo = await pool.query(`
            SELECT tv.nombre, COALESCE(COUNT(*), 0) as total
            FROM tipos_vino tv
            LEFT JOIN vinos v ON tv.id = v.tipo_vino_id
            GROUP BY tv.nombre ORDER BY total DESC
        `);
        const por_pais = await pool.query(`
            SELECT p.nombre, COALESCE(COUNT(*), 0) as total
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
// PÁGINA PRINCIPAL (HTML/CSS/JS)
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
            margin-right: 10px;
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
        
        .result strong { color: #D4AF37; }
        
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
            <button class="tab-btn active" onclick="switchTab('movimientos')">🔄 Movimientos</button>
            <button class="tab-btn" onclick="switchTab('inventario')">📚 Inventario</button>
            <button class="tab-btn" onclick="switchTab('scanner')">📱 Scanner QR</button>
            <button class="tab-btn" onclick="switchTab('etiquetas')">🏷️ Etiquetas</button>
            <button class="tab-btn" onclick="switchTab('reportes')">📊 Reportes</button>
            <button class="tab-btn" onclick="switchTab('admin')">⚙️ Admin</button>
        </div>

        <!-- TAB: INVENTARIO -->
        <div id="inventario" class="tab-content">
            <h2>Inventario Completo</h2>
            <button onclick="cargarInventario()">Cargar Inventario</button>
            <div id="tabla-inventario"></div>
        </div>

        <!-- TAB: MOVIMIENTOS -->
        <div id="movimientos" class="tab-content active">
            <h2>🔄 Movimientos de Vino</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px;">Registra entrada de nuevas botellas o movimientos en existentes (consumo, venta, daño, pérdida)</p>
            
            <div class="form-group">
                <label>Tipo de Movimiento *</label>
                <select id="tipo-movimiento" required onchange="cambiarTipoMovimiento()">
                    <option value="">-- Seleccionar --</option>
                    <option value="Entrada">📥 Entrada (Registrar nuevas botellas)</option>
                    <option value="Consumo">🍷 Consumo (Se bebió)</option>
                    <option value="Venta">💰 Venta (Se vendió)</option>
                    <option value="Daño">⚠️ Daño (Botella dañada)</option>
                    <option value="Pérdida">❌ Pérdida (No se encontró)</option>
                    <option value="Traslado">📍 Traslado (Otra ubicación)</option>
                </select>
            </div>

            <!-- FORMULARIO ENTRADA (NUEVO VINO) -->
            <div id="form-entrada" style="display:none;">
                <h3 style="margin: 20px 0;">📥 Registrar Nueva Entrada</h3>
                
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

                <div class="form-group">
                    <label>Cantidad de Botellas * (Cada una tendrá su propio código QR)</label>
                    <input type="number" id="cantidad" placeholder="1" min="1" required>
                </div>

                <div class="form-group">
                    <label>Notas</label>
                    <textarea id="notas-entrada" placeholder="Observaciones adicionales..." rows="3"></textarea>
                </div>

                <button onclick="registrarEntrada()">Registrar Entrada</button>
                <div id="resultado-entrada" class="result" style="display:none;"></div>
            </div>

            <!-- FORMULARIO MOVIMIENTO (VINO EXISTENTE) -->
            <div id="form-movimiento" style="display:none;">
                <h3 style="margin: 20px 0;" id="titulo-movimiento"></h3>

                <div class="form-group">
                    <label>Código QR de la Botella *</label>
                    <input type="text" id="vino-codigo" placeholder="Escanea o pega código QR" required>
                    <button onclick="buscarVinoParaMovimiento()" style="margin-top: 10px;">Buscar Vino</button>
                </div>

                <div id="info-vino-movimiento" style="display:none; background: rgba(76, 175, 80, 0.1); padding: 15px; border-radius: 5px; margin: 15px 0; border-left: 4px solid #4CAF50;">
                    <strong id="vino-info"></strong>
                </div>

                <div class="form-group">
                    <label>Razón/Observación</label>
                    <textarea id="razon-movimiento" placeholder="Por qué se realiza este movimiento..." rows="3"></textarea>
                </div>

                <div class="form-group">
                    <label>Notas Adicionales</label>
                    <textarea id="notas-movimiento" placeholder="Notas..." rows="2"></textarea>
                </div>

                <button onclick="registrarMovimiento()" id="btn-registrar-mov">Registrar Movimiento</button>
                <div id="resultado-movimiento" class="result" style="display:none;"></div>
            </div>

            <hr style="margin: 30px 0; border: 1px solid #444;">

            <h3>📋 Historial de Movimientos</h3>
            <button onclick="cargarMovimientos()">Cargar Historial</button>
            <div id="tabla-movimientos"></div>
        </div>

        <!-- TAB: SCANNER QR -->
        <div id="scanner" class="tab-content">
            <h2>Escanear Botella por QR</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px;">💡 Cuando tengas el scanner, escanea el código QR de la botella aquí</p>
            
            <div class="form-group">
                <label>Código QR (Escanear o pegar manualmente)</label>
                <input type="text" id="codigo-qr-scanner" placeholder="Escanea aquí..." autofocus>
                <button onclick="buscarPorQR()">Buscar Botella</button>
            </div>

            <div id="resultado-scanner" class="result" style="display:none;"></div>
        </div>

        <!-- TAB: ETIQUETAS -->
        <div id="etiquetas" class="tab-content">
            <h2>Descargar Etiquetas con QR</h2>
            <p style="color: #b0b0b0; margin-bottom: 20px;">📥 Descarga etiquetas en PDF para imprimir en tu impresora térmica</p>
            
            <div class="form-group">
                <label>Selecciona la bodega para descargar etiquetas:</label>
                <select id="bodega-etiquetas">
                    <option value="">-- Cargar bodegas --</option>
                </select>
                <button onclick="descargarEtiquetas()" style="margin-top: 10px;">Descargar PDF</button>
            </div>

            <div id="resultado-etiquetas" class="result" style="display:none;"></div>
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

        async function cargarDatos() {
            try {
                const tipos = await fetch('/api/tipos-vino').then(r => r.json());
                const paises = await fetch('/api/paises').then(r => r.json());
                
                const tipoSelect = document.getElementById('tipo_vino_id');
                tipos.forEach(t => {
                    tipoSelect.innerHTML += \`<option value="\${t.id}">\${t.nombre}</option>\`;
                });
                
                const paisSelect = document.getElementById('pais_id');
                paises.forEach(p => {
                    paisSelect.innerHTML += \`<option value="\${p.id}">\${p.nombre}</option>\`;
                });
                
                // Cargar bodegasúnicas en etiquetas
                const vinos = await fetch('/api/vinos').then(r => r.json());
                const bodegas = [...new Set(vinos.map(v => v.bodega))].sort();
                const bodegaSelect = document.getElementById('bodega-etiquetas');
                bodegas.forEach(b => {
                    bodegaSelect.innerHTML += \`<option value="\${b}">\${b}</option>\`;
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

        function cambiarTipoMovimiento() {
            const tipo = document.getElementById('tipo-movimiento').value;
            const formEntrada = document.getElementById('form-entrada');
            const formMovimiento = document.getElementById('form-movimiento');
            
            if (tipo === 'Entrada') {
                formEntrada.style.display = 'block';
                formMovimiento.style.display = 'none';
                document.getElementById('resultado-entrada').style.display = 'none';
            } else if (tipo) {
                formEntrada.style.display = 'none';
                formMovimiento.style.display = 'block';
                document.getElementById('resultado-movimiento').style.display = 'none';
                
                // Actualizar título del formulario
                const titulos = {
                    'Consumo': '🍷 Registrar Consumo',
                    'Venta': '💰 Registrar Venta',
                    'Daño': '⚠️ Registrar Daño',
                    'Pérdida': '❌ Registrar Pérdida',
                    'Traslado': '📍 Registrar Traslado'
                };
                document.getElementById('titulo-movimiento').textContent = titulos[tipo] || 'Registrar Movimiento';
            } else {
                formEntrada.style.display = 'none';
                formMovimiento.style.display = 'none';
            }
        }

        async function registrarEntrada() {
            const datos = {
                tipo_vino_id: document.getElementById('tipo_vino_id').value,
                pais_id: document.getElementById('pais_id').value,
                region_id: document.getElementById('region_id').value,
                bodega: document.getElementById('bodega').value,
                ano: document.getElementById('ano').value,
                cantidad: document.getElementById('cantidad').value,
                notas: document.getElementById('notas-entrada').value
            };

            if (!datos.tipo_vino_id || !datos.pais_id || !datos.bodega || !datos.ano || !datos.cantidad) {
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
                    let msg = \`✅ <strong>\${result.message}</strong><br><br>\`;
                    msg += \`<strong>Detalles de cada botella:</strong><br>\`;
                    result.vinos.forEach((v, i) => {
                        msg += \`<br><strong>Botella \${i+1}:</strong><br>\`;
                        msg += \`📍 Zona: <strong>\${v.ubicacion.zona}</strong>, Columna: \${v.ubicacion.columna}, Fila: \${v.ubicacion.fila}<br>\`;
                        msg += \`🔖 Código QR: <code style="background: #333; padding: 3px; border-radius: 3px;">\${v.codigo_qr}</code>\`;
                    });
                    mostrarResultado('resultado-entrada', msg);
                    document.getElementById('form-entrada').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
                } else {
                    mostrarResultado('resultado-entrada', '❌ Error: ' + result.error, true);
                }
            } catch (err) {
                mostrarResultado('resultado-entrada', '❌ Error: ' + err.message, true);
            }
        }

        async function buscarVinoParaMovimiento() {
            const codigo = document.getElementById('vino-codigo').value.trim();
            if (!codigo) {
                mostrarResultado('resultado-movimiento', '❌ Por favor escanea o escribe un código QR', true);
                return;
            }

            try {
                const response = await fetch(\`/api/vinos/qr/\${codigo}\`);
                const vino = await response.json();
                
                if (vino.error) {
                    mostrarResultado('resultado-movimiento', '❌ ' + vino.error, true);
                    document.getElementById('info-vino-movimiento').style.display = 'none';
                } else {
                    const ubicacion = vino.zona_nombre ? \`<strong>\${vino.zona_nombre}</strong> (Col: \${vino.columna}, Fila: \${vino.fila})\` : 'Sin ubicar';
                    document.getElementById('vino-info').innerHTML = \`
                        📍 \${vino.bodega} - Año \${vino.ano} (\${vino.tipo_nombre})<br>
                        Ubicación: \${ubicacion}<br>
                        Estado: <strong style="color: #D4AF37;">\${vino.estado}</strong>
                    \`;
                    document.getElementById('info-vino-movimiento').style.display = 'block';
                    document.getElementById('vino-codigo').dataset.vinoId = vino.id;
                    document.getElementById('btn-registrar-mov').disabled = false;
                }
            } catch (err) {
                mostrarResultado('resultado-movimiento', '❌ Error: ' + err.message, true);
            }
        }

        async function registrarMovimiento() {
            const tipoMovimiento = document.getElementById('tipo-movimiento').value;
            const vinoId = document.getElementById('vino-codigo').dataset.vinoId;
            const razon = document.getElementById('razon-movimiento').value;
            const notas = document.getElementById('notas-movimiento').value;

            if (!tipoMovimiento) {
                mostrarResultado('resultado-movimiento', '❌ Por favor selecciona tipo de movimiento', true);
                return;
            }

            if (!vinoId) {
                mostrarResultado('resultado-movimiento', '❌ Por favor busca un vino primero', true);
                return;
            }

            try {
                const response = await fetch(\`/api/vinos/\${vinoId}/movimiento\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo_movimiento: tipoMovimiento, razon, notas })
                });
                const result = await response.json();

                if (result.success) {
                    mostrarResultado('resultado-movimiento', \`✅ \${result.message}<br>Nuevo estado: <strong>\${result.nuevoEstado}</strong>\`);
                    document.getElementById('movimientos').querySelectorAll('input, select, textarea').forEach(el => el.value = '');
                    document.getElementById('info-vino-movimiento').style.display = 'none';
                    document.getElementById('vino-codigo').dataset.vinoId = '';
                } else {
                    mostrarResultado('resultado-movimiento', '❌ Error: ' + result.error, true);
                }
            } catch (err) {
                mostrarResultado('resultado-movimiento', '❌ Error: ' + err.message, true);
            }
        }

        async function cargarMovimientos() {
            try {
                const movimientos = await fetch('/api/movimientos').then(r => r.json());
                
                if (!movimientos || movimientos.length === 0) {
                    document.getElementById('tabla-movimientos').innerHTML = '<p style="color: #b0b0b0;">No hay movimientos registrados</p>';
                    return;
                }

                let html = \`<table><thead><tr>
                    <th>Fecha</th><th>Bodega</th><th>Año</th><th>Tipo</th><th>Tipo de Vino</th><th>Movimiento</th><th>Razón</th><th>Notas</th>
                </tr></thead><tbody>\`;
                
                movimientos.forEach(m => {
                    const fecha = new Date(m.fecha_movimiento).toLocaleString();
                    html += \`<tr>
                        <td>\${fecha}</td>
                        <td>\${m.bodega}</td>
                        <td>\${m.ano}</td>
                        <td>\${m.tipo_vino || '-'}</td>
                        <td><strong style="color: #D4AF37;">\${m.tipo_movimiento}</strong></td>
                        <td>\${m.razon || '-'}</td>
                        <td>\${m.notas || '-'}</td>
                    </tr>\`;
                });
                
                html += '</tbody></table>';
                document.getElementById('tabla-movimientos').innerHTML = html;
            } catch (err) {
                document.getElementById('tabla-movimientos').innerHTML = '<p style="color: #f44336;">Error al cargar: ' + err.message + '</p>';
            }
        }
            try {
                const vinos = await fetch('/api/vinos').then(r => r.json());
                
                if (!vinos || vinos.length === 0) {
                    document.getElementById('tabla-inventario').innerHTML = '<p style="color: #b0b0b0;">No hay vinos registrados</p>';
                    return;
                }

                let html = \`<table><thead><tr>
                    <th>Bodega</th><th>Tipo</th><th>País</th><th>Año</th><th>📍 Ubicación</th><th>Código QR</th><th>Registrado</th>
                </tr></thead><tbody>\`;
                
                vinos.forEach(v => {
                    const fecha = new Date(v.fecha_ingreso).toLocaleDateString();
                    const ubicacion = v.zona_nombre ? \`<strong>\${v.zona_nombre}</strong> (\${v.columna},\${v.fila})\` : 'Sin ubicar';
                    const codigo = v.codigo_qr.substring(0, 12) + '...';
                    html += \`<tr>
                        <td>\${v.bodega}</td>
                        <td>\${v.tipo_nombre || '-'}</td>
                        <td>\${v.pais_nombre || '-'}</td>
                        <td>\${v.ano}</td>
                        <td>\${ubicacion}</td>
                        <td><code style="background: #333; padding: 3px; border-radius: 3px;">\${codigo}</code></td>
                        <td>\${fecha}</td>
                    </tr>\`;
                });
                
                html += '</tbody></table>';
                document.getElementById('tabla-inventario').innerHTML = html;
            } catch (err) {
                document.getElementById('tabla-inventario').innerHTML = '<p style="color: #f44336;">Error al cargar: ' + err.message + '</p>';
            }
        }

        async function buscarPorQR() {
            const codigo = document.getElementById('codigo-qr-scanner').value.trim();
            if (!codigo) {
                mostrarResultado('resultado-scanner', '❌ Por favor escanea o escribe un código QR', true);
                return;
            }

            try {
                const response = await fetch(\`/api/vinos/qr/\${codigo}\`);
                const vino = await response.json();
                
                if (vino.error) {
                    mostrarResultado('resultado-scanner', '❌ ' + vino.error, true);
                } else {
                    const ubicacion = vino.zona_nombre ? \`<strong>\${vino.zona_nombre}</strong> (Col: \${vino.columna}, Fila: \${vino.fila})\` : 'Sin ubicar';
                    const msg = \`✅ <strong>Botella encontrada</strong><br><br>
                        <strong>Bodega:</strong> \${vino.bodega}<br>
                        <strong>Tipo:</strong> \${vino.tipo_nombre}<br>
                        <strong>País:</strong> \${vino.pais_nombre}<br>
                        <strong>Año:</strong> \${vino.ano}<br>
                        <br>
                        <strong style="color: #D4AF37;">📍 UBICACIÓN:</strong><br>
                        \${ubicacion}<br>
                        <br>
                        <strong>Código QR:</strong> \${vino.codigo_qr}\`;
                    mostrarResultado('resultado-scanner', msg);
                    document.getElementById('codigo-qr-scanner').value = '';
                }
            } catch (err) {
                mostrarResultado('resultado-scanner', '❌ Error: ' + err.message, true);
            }
        }

        async function descargarEtiquetas() {
            const bodega = document.getElementById('bodega-etiquetas').value;
            if (!bodega) {
                mostrarResultado('resultado-etiquetas', '❌ Por favor selecciona una bodega', true);
                return;
            }

            try {
                window.open(\`/api/vinos/descargar-etiquetas/\${encodeURIComponent(bodega)}\`);
                mostrarResultado('resultado-etiquetas', '✅ Descargando PDF de etiquetas...');
            } catch (err) {
                mostrarResultado('resultado-etiquetas', '❌ Error: ' + err.message, true);
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
