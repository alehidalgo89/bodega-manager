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

// ===== SETUP =====
app.get('/setup', async (req, res) => {
    try {
        await pool.query('DROP TABLE IF EXISTS vinos CASCADE');
        await pool.query('DROP TABLE IF EXISTS tipos CASCADE');
        await pool.query('DROP TABLE IF EXISTS paises CASCADE');
        
        await pool.query('CREATE TABLE paises (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE tipos (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE)');
        await pool.query('CREATE TABLE vinos (id SERIAL PRIMARY KEY, nombre VARCHAR(200), tipo_id INT, pais_id INT, bodega VARCHAR(100), ano INT)');
        
        await pool.query('INSERT INTO paises (nombre) VALUES ($1), ($2), ($3)', ['Argentina', 'Chile', 'España']);
        await pool.query('INSERT INTO tipos (nombre) VALUES ($1), ($2), ($3)', ['Tinto', 'Blanco', 'Rosado']);
        
        res.json({ ok: true });
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

app.get('/api/tipos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM tipos');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.get('/api/vinos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM vinos');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

app.post('/api/vinos', async (req, res) => {
    const { nombre, tipo_id, pais_id, bodega, ano } = req.body;
    try {
        const result = await pool.query('INSERT INTO vinos (nombre, tipo_id, pais_id, bodega, ano) VALUES ($1, $2, $3, $4, $5) RETURNING *', 
            [nombre, tipo_id, pais_id, bodega, ano]);
        res.json({ ok: true, vino: result.rows[0] });
    } catch (err) {
        res.json({ error: err.message });
    }
});

// ===== HTML BÁSICO =====
app.get('/', (req, res) => {
    res.send(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bodegas</title>
    <style>
        body { font-family: Arial; background: #08091a; color: #f5f5f5; padding: 20px; }
        h1 { color: #d4a574; }
        .section { background: #1a1a2e; padding: 20px; margin: 20px 0; border-radius: 8px; border: 1px solid #d4a574; }
        input, select { background: #2a2a3e; color: #f5f5f5; border: 1px solid #d4a574; padding: 8px; width: 100%; margin: 5px 0; }
        button { background: #d4a574; color: #000; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #d4a574; }
        .msg { color: #d4a574; margin-top: 10px; }
    </style>
</head>
<body>
    <h1>🍷 BODEGAS</h1>
    
    <div class="section">
        <h2>Registrar Vino</h2>
        <input type="text" id="nombre" placeholder="Nombre">
        <select id="tipo"><option>-- Tipo --</option></select>
        <select id="pais"><option>-- País --</option></select>
        <input type="text" id="bodega" placeholder="Bodega">
        <input type="number" id="ano" placeholder="Año">
        <button onclick="registrar()">Registrar</button>
        <div class="msg" id="msg"></div>
    </div>
    
    <div class="section">
        <h2>Inventario</h2>
        <table><thead><tr><th>Nombre</th><th>Tipo</th><th>País</th><th>Bodega</th><th>Año</th></tr></thead><tbody id="tabla"></tbody></table>
    </div>
    
    <div class="section">
        <h2>Admin</h2>
        <button onclick="init()">INICIALIZAR BD</button>
    </div>
    
    <script>
        function cargar() {
            fetch('/api/tipos').then(r => r.json()).then(d => {
                const sel = document.getElementById('tipo');
                d.forEach(t => { const o = document.createElement('option'); o.value = t.id; o.text = t.nombre; sel.appendChild(o); });
            });
            
            fetch('/api/paises').then(r => r.json()).then(d => {
                const sel = document.getElementById('pais');
                d.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.text = p.nombre; sel.appendChild(o); });
            });
            
            cargarVinos();
        }
        
        function cargarVinos() {
            fetch('/api/vinos').then(r => r.json()).then(d => {
                const t = document.getElementById('tabla');
                t.innerHTML = d.map(v => '<tr><td>' + v.nombre + '</td><td>' + v.tipo_id + '</td><td>' + v.pais_id + '</td><td>' + v.bodega + '</td><td>' + v.ano + '</td></tr>').join('');
            });
        }
        
        function registrar() {
            const n = document.getElementById('nombre').value;
            const t = document.getElementById('tipo').value;
            const p = document.getElementById('pais').value;
            const b = document.getElementById('bodega').value;
            const a = document.getElementById('ano').value;
            
            if (!n || !t || !p) { alert('Completa campos'); return; }
            
            fetch('/api/vinos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: n, tipo_id: parseInt(t), pais_id: parseInt(p), bodega: b, ano: parseInt(a) })
            }).then(r => r.json()).then(d => {
                if (d.ok) { document.getElementById('msg').textContent = '✓ Registrado'; document.getElementById('nombre').value = ''; cargarVinos(); }
                else document.getElementById('msg').textContent = '✗ Error: ' + d.error;
            });
        }
        
        function init() {
            fetch('/setup').then(r => r.json()).then(d => {
                if (d.ok) { alert('✓ BD inicializada'); setTimeout(cargar, 500); }
                else alert('✗ ' + d.error);
            });
        }
        
        cargar();
    </script>
</body>
</html>`);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('✓ Puerto ' + PORT));
