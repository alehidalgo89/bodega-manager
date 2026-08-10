// ============================================
// BODEGA DE CANDINHO - SERVIDOR BACKEND
// Node.js + Express + PostgreSQL
// ============================================

const express = require('express');
const cors = require('cors');
const pg = require('pg');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Conexión a PostgreSQL
const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/bodega_candinho'
});

// ============================================
// RUTAS DE PAÍSES Y REGIONES
// ============================================

// Obtener todos los países
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener regiones de un país
app.get('/api/paises/:pais_id/regiones', async (req, res) => {
    try {
        const { pais_id } = req.params;
        const result = await pool.query(
            'SELECT * FROM regiones WHERE pais_id = $1 ORDER BY nombre',
            [pais_id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE TIPOS DE VINO
// ============================================

app.get('/api/tipos-vino', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE ZONAS
// ============================================

app.get('/api/zonas', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM zonas ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE VINOS
// ============================================

// Crear nuevo vino
app.post('/api/vinos', async (req, res) => {
    const client = await pool.connect();
    try {
        const { tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, cantidad_minima, notas } = req.body;

        // Validar datos
        if (!tipo_vino_id || !pais_id || !bodega || !ano) {
            return res.status(400).json({ error: 'Datos requeridos faltantes' });
        }

        // Generar código QR único
        const codigo_qr = uuidv4();

        // Encontrar ubicación disponible
        const ubicacion = await client.query(
            'SELECT id FROM ubicaciones WHERE disponible = true LIMIT 1'
        );

        if (ubicacion.rows.length === 0) {
            return res.status(400).json({ error: 'No hay ubicaciones disponibles en la bodega' });
        }

        const ubicacion_id = ubicacion.rows[0].id;

        // Insertar vino
        const result = await client.query(
            `INSERT INTO vinos (codigo_qr, tipo_vino_id, pais_id, region_id, bodega, ano, cantidad, cantidad_minima, ubicacion_id, notas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [codigo_qr, tipo_vino_id, pais_id, region_id || null, bodega, ano, cantidad || 1, cantidad_minima || 0, ubicacion_id, notas || null]
        );

        // Marcar ubicación como no disponible
        await client.query('UPDATE ubicaciones SET disponible = false WHERE id = $1', [ubicacion_id]);

        // Registrar movimiento
        await client.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad) VALUES ($1, $2, $3)',
            [result.rows[0].id, 'Entrada', cantidad || 1]
        );

        // Generar imagen QR
        const qr_image = await QRCode.toDataURL(codigo_qr);

        res.json({
            ...result.rows[0],
            qr_image
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// Obtener todos los vinos con detalles
app.get('/api/vinos', async (req, res) => {
    try {
        const { tipo, pais, region, ano, bodega } = req.query;
        let query = `
            SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE 1=1
        `;
        const params = [];

        if (tipo) {
            query += ` AND tv.id = $${params.length + 1}`;
            params.push(tipo);
        }
        if (pais) {
            query += ` AND p.id = $${params.length + 1}`;
            params.push(pais);
        }
        if (region) {
            query += ` AND r.id = $${params.length + 1}`;
            params.push(region);
        }
        if (ano) {
            query += ` AND v.ano = $${params.length + 1}`;
            params.push(ano);
        }
        if (bodega) {
            query += ` AND v.bodega ILIKE $${params.length + 1}`;
            params.push(`%${bodega}%`);
        }

        query += ' ORDER BY tv.nombre, r.nombre, v.ano DESC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener vino por código QR
app.get('/api/vinos/qr/:codigo_qr', async (req, res) => {
    try {
        const { codigo_qr } = req.params;
        const result = await pool.query(
            `SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE v.codigo_qr = $1`,
            [codigo_qr]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Obtener vino por ID
app.get('/api/vinos/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            `SELECT 
                v.*,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                r.nombre as region_nombre,
                z.nombre as zona_nombre,
                u.columna, u.fila
            FROM vinos v
            LEFT JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            LEFT JOIN paises p ON v.pais_id = p.id
            LEFT JOIN regiones r ON v.region_id = r.id
            LEFT JOIN ubicaciones u ON v.ubicacion_id = u.id
            LEFT JOIN zonas z ON u.zona_id = z.id
            WHERE v.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Registrar salida de vino
app.post('/api/vinos/:id/salida', async (req, res) => {
    try {
        const { id } = req.params;
        const { cantidad, notas } = req.body;

        // Obtener vino actual
        const vino = await pool.query('SELECT * FROM vinos WHERE id = $1', [id]);
        if (vino.rows.length === 0) {
            return res.status(404).json({ error: 'Vino no encontrado' });
        }

        const cantidad_actual = vino.rows[0].cantidad;
        const nueva_cantidad = cantidad_actual - cantidad;

        if (nueva_cantidad < 0) {
            return res.status(400).json({ error: 'Cantidad insuficiente' });
        }

        // Actualizar cantidad de vino
        const result = await pool.query(
            'UPDATE vinos SET cantidad = $1 WHERE id = $2 RETURNING *',
            [nueva_cantidad, id]
        );

        // Registrar movimiento
        await pool.query(
            'INSERT INTO movimientos (vino_id, tipo_movimiento, cantidad, notas) VALUES ($1, $2, $3, $4)',
            [id, 'Salida', cantidad, notas || null]
        );

        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE MOVIMIENTOS
// ============================================

app.get('/api/movimientos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                m.*,
                v.codigo_qr,
                tv.nombre as tipo_nombre,
                p.nombre as pais_nombre,
                v.bodega
            FROM movimientos m
            JOIN vinos v ON m.vino_id = v.id
            JOIN tipos_vino tv ON v.tipo_vino_id = tv.id
            JOIN paises p ON v.pais_id = p.id
            ORDER BY m.fecha_movimiento DESC
            LIMIT 100
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE REPORTES
// ============================================

app.get('/api/reportes/resumen', async (req, res) => {
    try {
        const total_botellas = await pool.query('SELECT COALESCE(SUM(cantidad), 0) as total FROM vinos');
        const por_tipo = await pool.query(`
            SELECT tv.nombre, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM tipos_vino tv
            LEFT JOIN vinos v ON tv.id = v.tipo_vino_id
            GROUP BY tv.id, tv.nombre
            ORDER BY tv.nombre
        `);
        const por_pais = await pool.query(`
            SELECT p.nombre, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM paises p
            LEFT JOIN vinos v ON p.id = v.pais_id
            GROUP BY p.id, p.nombre
            ORDER BY cantidad DESC
            LIMIT 10
        `);
        const por_region = await pool.query(`
            SELECT r.nombre, p.nombre as pais, COALESCE(SUM(v.cantidad), 0) as cantidad
            FROM regiones r
            LEFT JOIN paises p ON r.pais_id = p.id
            LEFT JOIN vinos v ON r.id = v.region_id
            GROUP BY r.id, r.nombre, p.nombre
            ORDER BY cantidad DESC
            LIMIT 15
        `);

        res.json({
            total_botellas: total_botellas.rows[0].total,
            por_tipo: por_tipo.rows,
            por_pais: por_pais.rows,
            por_region: por_region.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RUTAS DE CONFIGURACIÓN
// ============================================

app.get('/api/configuracion', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM configuracion LIMIT 1');
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============================================
// SERVIR ARCHIVOS ESTÁTICOS Y HTML
// ============================================

// Servir archivos estáticos desde la carpeta public
app.use(express.static('public'));

// Servir index.html en la raíz
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Página 404
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
});

// ============================================
// INICIAR SERVIDOR
// ============================================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor Bodega de Candinho corriendo en puerto ${PORT}`);
});
