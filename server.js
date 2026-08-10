const express = require('express');
const cors = require('cors');
const pg = require('pg');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL
});

// Test de conexión simple
app.get('/test', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0].now });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Crear tablas
app.get('/setup', async (req, res) => {
    try {
        // Crear tabla paises
        await pool.query(`
            CREATE TABLE IF NOT EXISTS paises (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                codigo_iso VARCHAR(2)
            )
        `);

        // Limpiar datos previos
        await pool.query('DELETE FROM paises');

        // Insertar países
        const paises_sql = `
            INSERT INTO paises (nombre, codigo_iso) VALUES
            ('Francia', 'FR'),
            ('Italia', 'IT'),
            ('España', 'ES'),
            ('Austria', 'AT'),
            ('Croacia', 'HR'),
            ('Alemania', 'DE'),
            ('Portugal', 'PT'),
            ('Argentina', 'AR'),
            ('Chile', 'CL'),
            ('Australia', 'AU'),
            ('Sudáfrica', 'ZA'),
            ('Nueva Zelanda', 'NZ'),
            ('Estados Unidos', 'US'),
            ('Hungría', 'HU'),
            ('Rumania', 'RO')
        `;
        
        await pool.query(paises_sql);

        res.json({ success: true, message: 'Base de datos inicializada' });
    } catch (err) {
        res.json({ success: false, error: err.message });
    }
});

// Obtener países
app.get('/api/paises', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM paises ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        res.json({ error: err.message });
    }
});

// Página principal
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Bodega de Candinho</title>
    <style>
        body { 
            font-family: Arial; 
            background: #1a1a1a; 
            color: white; 
            padding: 40px;
            text-align: center;
        }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: #D4AF37; }
        button { 
            background: #4CAF50; 
            color: white; 
            border: none; 
            padding: 10px 20px; 
            cursor: pointer;
            border-radius: 5px;
        }
        button:hover { background: #45a049; }
        .result { 
            background: #333; 
            padding: 20px; 
            margin-top: 20px; 
            border-radius: 5px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🍷 Bodega de Candinho</h1>
        <p>Sistema de Gestión de Inventario</p>
        
        <button onclick="setup()">1. Inicializar BD</button>
        <button onclick="test()">2. Probar Conexión</button>
        <button onclick="getPaises()">3. Obtener Países</button>
        
        <div id="result" class="result" style="display:none;"></div>
    </div>

    <script>
        function setup() {
            fetch('/setup')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function test() {
            fetch('/test')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function getPaises() {
            fetch('/api/paises')
                .then(r => r.json())
                .then(d => show(d));
        }
        
        function show(data) {
            const result = document.getElementById('result');
            result.textContent = JSON.stringify(data, null, 2);
            result.style.display = 'block';
        }
    </script>
</body>
</html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log('Servidor en puerto ' + PORT);
});
