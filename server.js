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
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE variedades (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE, columnas INT, filas INT)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id) ON DELETE CASCADE, columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE, UNIQUE(zona_id, columna, fila))');
        await pool.query(`CREATE TABLE vinos (id SERIAL PRIMARY KEY, codigo_qr VARCHAR(100) UNIQUE, nombre_vino VARCHAR(200), tipo_vino_id INTEGER REFERENCES tipos_vino(id), pais_id INTEGER REFERENCES paises(id), region_id INTEGER REFERENCES regiones(id), bodega VARCHAR(100), ano INT, ubicacion_id INTEGER REFERENCES ubicaciones(id), estado VARCHAR(50) DEFAULT 'activa', fecha_ingreso TIMESTAMP DEFAULT NOW())`);
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
        
        res.json({ ok: true, message: 'Base de datos inicializada correctamente' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== APIs =====
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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html', err => {
        if (err) {
            res.send('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bodegas</title><link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600&display=swap" rel="stylesheet"><style>body{font-family:"Lora",serif;background:#08091a;color:#f5f5f5;padding:40px}</style></head><body><h1 style="font-family:Playfair Display;color:#d4a574">Bodegas</h1><p>Sistema de gestión de inventario.</p><p><a href="/api/disponibilidad" style="color:#d4a574">Ver API</a></p></body></html>');
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Servidor en puerto ' + PORT));
