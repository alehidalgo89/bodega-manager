const express = require('express');
const cors = require('cors');
const pg = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// SETUP - Inicializar BD
app.get('/setup', async (req, res) => {
    try {
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_vino CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, nombre VARCHAR(200), tipo_id INTEGER REFERENCES tipos_vino(id), ubicacion_id INTEGER REFERENCES ubicaciones(id))');
        await pool.query('CREATE TABLE movimientos (id SERIAL PRIMARY KEY, vino_id INTEGER REFERENCES vinos(id), tipo VARCHAR(50), fecha TIMESTAMP DEFAULT NOW())');
        
        await pool.query('INSERT INTO paises (nombre) VALUES ($1), ($2), ($3)', ['Argentina', 'Chile', 'España']);
        await pool.query('INSERT INTO tipos_vino (nombre) VALUES ($1), ($2), ($3)', ['Tinto', 'Blanco', 'Rosado']);
        
        const zonas = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
        for (const zona of zonas) {
            const zRes = await pool.query('INSERT INTO zonas (nombre) VALUES ($1) RETURNING id', [zona]);
            const zoneId = zRes.rows[0].id;
            for (let col = 1; col <= 20; col++) {
                for (let fila = 1; fila <= 20; fila++) {
                    await pool.query('INSERT INTO ubicaciones (zona_id, columna, fila) VALUES ($1, $2, $3)', [zoneId, col, fila]);
                }
            }
        }
        
        res.json({ ok: true, msg: 'BD inicializada' });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// APIs
app.get('/api/tipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_vino');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/disponibilidad', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) FROM ubicaciones WHERE disponible = TRUE');
        res.json({ disponibles: result.rows[0].count });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// HTML Principal
app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bodegas</title>
        <style>
            body { font-family: Arial; background: #08091a; color: #f5f5f5; padding: 20px; }
            h1 { color: #d4a574; }
            .section { background: #1a1a2e; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #d4a574; }
            select, input { background: #2a2a3e; color: #f5f5f5; border: 1px solid #d4a574; padding: 8px; border-radius: 4px; }
            button { background: #d4a574; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
            button:hover { opacity: 0.8; }
            .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
            .stat-card { background: #2a2a3e; padding: 15px; border-radius: 6px; text-align: center; border: 1px solid #d4a574; }
            .stat-value { font-size: 2em; color: #d4a574; font-weight: bold; }
        </style>
    </head>
    <body>
        <h1>🍷 BODEGAS - Sistema de Gestión</h1>
        
        <div class="section">
            <h2>Registrar Botella</h2>
            <div style="margin-bottom: 10px;">
                <label>Nombre:</label>
                <input type="text" id="nombre" placeholder="Malbec">
            </div>
            <div style="margin-bottom: 10px;">
                <label>Tipo:</label>
                <select id="tipo">
                    <option value="">Cargar tipos...</option>
                </select>
            </div>
            <button onclick="registrar()">Registrar</button>
        </div>
        
        <div class="section">
            <h2>Estadísticas</h2>
            <div class="stats">
                <div class="stat-card">
                    <div>Disponibles</div>
                    <div class="stat-value" id="disponibles">0</div>
                </div>
                <div class="stat-card">
                    <div>Países</div>
                    <div class="stat-value" id="paises">0</div>
                </div>
                <div class="stat-card">
                    <div>Tipos</div>
                    <div class="stat-value" id="tipos">0</div>
                </div>
            </div>
        </div>
        
        <div class="section">
            <h2>Administración</h2>
            <button onclick="inicializar()">INICIALIZAR BD</button>
            <p id="msg" style="color: #d4a574;"></p>
        </div>
        
        <script>
        function cargarDatos() {
            fetch('/api/tipos').then(r => r.json()).then(d => {
                const sel = document.getElementById('tipo');
                sel.innerHTML = '<option>--Seleccionar--</option>';
                d.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.text = t.nombre;
                    sel.appendChild(opt);
                });
                document.getElementById('tipos').textContent = d.length;
            });
            
            fetch('/api/disponibilidad').then(r => r.json()).then(d => {
                document.getElementById('disponibles').textContent = d.disponibles || '0';
            });
            
            fetch('/api/paises').then(r => r.json()).then(d => {
                document.getElementById('paises').textContent = d.length || '0';
            });
        }
        
        function inicializar() {
            fetch('/setup').then(r => r.json()).then(d => {
                const msg = document.getElementById('msg');
                if (d.ok) {
                    msg.textContent = '✓ BD inicializada';
                    setTimeout(cargarDatos, 1000);
                } else {
                    msg.textContent = '✗ Error: ' + d.error;
                }
            });
        }
        
        function registrar() {
            alert('Funcionalidad completada en siguiente versión');
        }
        
        cargarDatos();
        </script>
    </body>
    </html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Servidor en puerto ' + PORT));
