const express = require('express');
const cors = require('cors');
const pg = require('pg');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

console.log('=== DIAGNÓSTICO ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'CONFIGURADA' : 'NO CONFIGURADA');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Pool error:', err);
});

// TEST DE CONEXIÓN
app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ 
            ok: true, 
            message: 'Base de datos conectada',
            time: result.rows[0]
        });
    } catch (err) {
        res.json({ 
            ok: false, 
            error: err.message,
            type: err.code 
        });
    }
});

// SETUP SIMPLIFICADO
app.get('/setup', async (req, res) => {
    try {
        console.log('Iniciando setup...');
        
        await pool.query('DROP TABLE IF EXISTS vino_variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS movimientos CASCADE');
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS ubicaciones CASCADE');
        await pool.query('DROP TABLE IF EXISTS zonas CASCADE');
        await pool.query('DROP TABLE IF EXISTS variedades CASCADE');
        await pool.query('DROP TABLE IF EXISTS regiones CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos_vino CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE tipos_vino (id SERIAL PRIMARY KEY, nombre VARCHAR(100) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE zonas (id SERIAL PRIMARY KEY, nombre VARCHAR(50) NOT NULL UNIQUE)');
        await pool.query('CREATE TABLE ubicaciones (id SERIAL PRIMARY KEY, zona_id INTEGER REFERENCES zonas(id), columna INT, fila INT, disponible BOOLEAN DEFAULT TRUE)');
        
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
        
        res.json({ ok: true, message: 'BD inicializada correctamente' });
    } catch (err) {
        res.json({ ok: false, error: err.message });
    }
});

app.get('/api/disponibilidad', async (req, res) => {
    try {
        const result = await pool.query('SELECT COUNT(*) as total FROM ubicaciones');
        const disp = await pool.query('SELECT COUNT(*) as disp FROM ubicaciones WHERE disponible = TRUE');
        res.json({ 
            total: parseInt(result.rows[0].total),
            disponibles: parseInt(disp.rows[0].disp),
            ocupadas: parseInt(result.rows[0].total) - parseInt(disp.rows[0].disp)
        });
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bodegas - Diagnóstico</title>
    <style>
        body { font-family: Arial; background: #08091a; color: #f5f5f5; padding: 40px; }
        h1 { color: #d4a574; }
        .box { background: #1a1a2e; border: 1px solid #d4a574; padding: 20px; margin: 20px 0; border-radius: 8px; }
        button { background: #d4a574; color: #000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; }
        button:hover { opacity: 0.9; }
        .success { color: #4ade80; }
        .error { color: #ff6b6b; }
        #status { margin-top: 20px; padding: 15px; border-radius: 6px; }
    </style>
</head>
<body>
    <h1>Bodegas - Sistema de Diagnóstico</h1>
    
    <div class="box">
        <h2>1. Verificar Conexión a BD</h2>
        <button onclick="testDB()">Test Conexión</button>
        <div id="dbStatus"></div>
    </div>
    
    <div class="box">
        <h2>2. Inicializar Base de Datos</h2>
        <button onclick="setupDB()">SETUP BD</button>
        <div id="setupStatus"></div>
    </div>
    
    <div class="box">
        <h2>3. Ver Estadísticas</h2>
        <button onclick="getStats()">Obtener Stats</button>
        <div id="statsStatus"></div>
    </div>
    
    <script>
        function testDB() {
            fetch('/test-db')
                .then(r => r.json())
                .then(d => {
                    const el = document.getElementById('dbStatus');
                    if (d.ok) {
                        el.innerHTML = '<div id="status" class="success">✓ BD CONECTADA</div>';
                    } else {
                        el.innerHTML = '<div id="status" class="error">✗ ERROR: ' + d.error + '</div>';
                    }
                });
        }
        
        function setupDB() {
            fetch('/setup')
                .then(r => r.json())
                .then(d => {
                    const el = document.getElementById('setupStatus');
                    if (d.ok) {
                        el.innerHTML = '<div id="status" class="success">✓ BD INICIALIZADA</div>';
                    } else {
                        el.innerHTML = '<div id="status" class="error">✗ ERROR: ' + d.error + '</div>';
                    }
                });
        }
        
        function getStats() {
            fetch('/api/disponibilidad')
                .then(r => r.json())
                .then(d => {
                    const el = document.getElementById('statsStatus');
                    if (d.error) {
                        el.innerHTML = '<div id="status" class="error">✗ ERROR: ' + d.error + '</div>';
                    } else {
                        el.innerHTML = '<div id="status" class="success">Total: ' + d.total + ' | Disponibles: ' + d.disponibles + ' | Ocupadas: ' + d.ocupadas + '</div>';
                    }
                });
        }
        
        // Auto-test al cargar
        window.onload = testDB;
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Servidor en puerto ' + PORT));
