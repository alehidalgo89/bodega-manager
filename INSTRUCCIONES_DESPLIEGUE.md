# 🍷 BODEGA DE CANDINHO - GUÍA COMPLETA DE DESPLIEGUE

## ÍNDICE
1. [Inicio Rápido Local](#inicio-rápido-local)
2. [Despliegue en la Nube](#despliegue-en-la-nube)
3. [Configuración de Base de Datos](#configuración-de-base-de-datos)
4. [Solución de Problemas](#solución-de-problemas)

---

## 📋 REQUISITOS PREVIOS

- Node.js 16+ instalado
- Git instalado
- Acceso a PostgreSQL (local o en la nube)
- Heroku CLI (para despliegue en Heroku)
- Una cuenta en Heroku (gratis)

---

## 🚀 INICIO RÁPIDO LOCAL

### 1. Preparar el Proyecto

```bash
# Crear carpeta del proyecto
mkdir bodega-candinho
cd bodega-candinho

# Copiar todos los archivos descargados aquí
# - server.js
# - App.jsx
# - App.css
# - package.json
# - .env.example

# Renombrar el archivo de configuración
cp .env.example .env
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Base de Datos PostgreSQL Localmente

#### Opción A: Con PostgreSQL instalado en tu PC

```bash
# En terminal (Linux/Mac) o PowerShell (Windows)

# Conectar a PostgreSQL
psql -U postgres

# Dentro de PostgreSQL, crear la base de datos
CREATE DATABASE bodega_candinho;

# Salir
\q

# Ejecutar el script SQL
psql -U postgres -d bodega_candinho -f bodega-database.sql
```

#### Opción B: Con Docker (más fácil)

```bash
# Instalar Docker desde: https://www.docker.com/products/docker-desktop

# Crear contenedor PostgreSQL
docker run --name bodega-db \
  -e POSTGRES_PASSWORD=tucontraseña \
  -e POSTGRES_DB=bodega_candinho \
  -p 5432:5432 \
  -d postgres:15

# Esperar 10 segundos a que inicie, luego:
psql -h localhost -U postgres -d bodega_candinho -f bodega-database.sql
```

### 4. Configurar Variables de Entorno

Editar `.env`:

```env
# Si usas PostgreSQL local:
DATABASE_URL=postgresql://postgres:tucontraseña@localhost:5432/bodega_candinho

# Si usas Docker:
DATABASE_URL=postgresql://postgres:tucontraseña@localhost:5432/bodega_candinho

PORT=5000
NODE_ENV=development
REACT_APP_API_URL=http://localhost:5000
```

### 5. Iniciar el Servidor

```bash
# Terminal 1: Inicia el servidor backend
npm start

# Deberías ver:
# "Servidor Bodega de Candinho corriendo en puerto 5000"
```

### 6. Acceder a la Aplicación

Abre tu navegador:
```
http://localhost:5000
```

---

## ☁️ DESPLIEGUE EN LA NUBE

### Opción 1: Desplegar en Heroku (RECOMENDADO - Gratis)

#### Paso 1: Crear Cuenta en Heroku

1. Ir a https://www.heroku.com
2. Crear cuenta gratuita
3. Descargar Heroku CLI desde: https://devcenter.heroku.com/articles/heroku-cli

#### Paso 2: Preparar el Proyecto para Heroku

Crear archivo `Procfile` en la carpeta raíz:

```
web: node server.js
```

Editar `package.json` y asegurar que tiene:

```json
{
  "engines": {
    "node": ">=16.0.0"
  },
  "scripts": {
    "start": "node server.js"
  }
}
```

#### Paso 3: Desplegar a Heroku

```bash
# Terminal

# Login en Heroku
heroku login

# Crear app en Heroku
heroku create bodega-candinho

# Crear base de datos PostgreSQL en Heroku (gratis)
heroku addons:create heroku-postgresql:hobby-dev -a bodega-candinho

# Ver la URL de la base de datos
heroku config -a bodega-candinho

# Copiar el valor de DATABASE_URL

# Configurar variables de entorno
heroku config:set NODE_ENV=production -a bodega-candinho
heroku config:set REACT_APP_API_URL=https://bodega-candinho.herokuapp.com -a bodega-candinho

# Enviar código a Heroku
git init
git add .
git commit -m "Initial commit - Bodega de Candinho"
git push heroku main

# Ejecutar el script de base de datos
heroku run "psql $DATABASE_URL -f bodega-database.sql" -a bodega-candinho

# Ver logs
heroku logs --tail -a bodega-candinho
```

Tu aplicación estará en: **https://bodega-candinho.herokuapp.com**

---

### Opción 2: Desplegar en Railway.app (Alternativa)

1. Ir a https://railway.app
2. Conectar cuenta de GitHub
3. Crear nuevo proyecto
4. Seleccionar este repositorio
5. Railway automáticamente detectará y desplegará

---

### Opción 3: Desplegar en tu propio servidor (VPS)

#### Con Ubuntu/Debian:

```bash
# Conectar por SSH a tu servidor
ssh usuario@tu-servidor.com

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar PostgreSQL
sudo apt install postgresql postgresql-contrib

# Descargar el proyecto
git clone https://github.com/tuusuario/bodega-candinho.git
cd bodega-candinho

# Instalar dependencias
npm install

# Configurar base de datos
sudo -u postgres psql
CREATE DATABASE bodega_candinho;
\q

psql -U postgres -d bodega_candinho -f bodega-database.sql

# Crear archivo .env
cp .env.example .env
# Editar .env con tus valores

# Instalar PM2 para mantener la app activa
sudo npm install -g pm2

# Iniciar con PM2
pm2 start server.js --name "bodega-candinho"

# Configurar reinicio automático
pm2 startup
pm2 save
```

---

## 🗄️ CONFIGURACIÓN DE BASE DE DATOS

### Para Heroku PostgreSQL

```bash
# Ver la URL de la BD
heroku config -a bodega-candinho

# La URL se verá como:
# postgres://usuario:password@host:puerto/database

# Usar esa URL en DATABASE_URL del archivo .env
```

### Para AWS RDS (Más potente)

1. Ir a AWS Console
2. Crear instancia RDS PostgreSQL
3. Copiar endpoint
4. Crear base de datos

```bash
PGPASSWORD=tucontraseña psql -h endpoint.rds.amazonaws.com -U postgres -d bodega_candinho -f bodega-database.sql
```

---

## 🧪 PRUEBAS INICIALES

Una vez desplegado:

### 1. Registrar un Vino de Prueba

```
POST http://localhost:5000/api/vinos
{
  "tipo_vino_id": 1,
  "pais_id": 1,
  "region_id": 1,
  "bodega": "Château Latour",
  "ano": 2015,
  "cantidad": 10,
  "cantidad_minima": 5
}
```

### 2. Obtener Todos los Vinos

```
GET http://localhost:5000/api/vinos
```

### 3. Obtener Resumen

```
GET http://localhost:5000/api/reportes/resumen
```

---

## 📱 ACCESO DESDE TABLET

### En la Misma Red WiFi (Local)

```
Abre el navegador de la tablet y ve a:
http://192.168.1.100:5000

(Reemplaza 192.168.1.100 con la IP de tu PC)
```

### Desde Cualquier Lugar (Si está en la nube)

```
Abre el navegador de la tablet y ve a:
https://bodega-candinho.herokuapp.com
```

---

## 🔧 VARIABLES DE ENTORNO

```env
# Requeridas
DATABASE_URL=postgresql://user:pass@host:port/database

# Opcionales
PORT=5000
NODE_ENV=production
REACT_APP_API_URL=https://tu-dominio.com
BODEGA_NOMBRE=Bodega de Candinho
```

---

## ❌ SOLUCIÓN DE PROBLEMAS

### Error: "Cannot connect to database"

```bash
# Verificar conexión PostgreSQL
psql $DATABASE_URL

# O si está local:
psql -h localhost -U postgres -d bodega_candinho
```

### Error: "Port already in use"

```bash
# Cambiar puerto en .env
PORT=3000

# O matar el proceso
lsof -ti:5000 | xargs kill -9
```

### Error: "Module not found"

```bash
# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

### La base de datos está vacía

```bash
# Ejecutar el script SQL nuevamente
psql -U postgres -d bodega_candinho -f bodega-database.sql
```

### La tablet no se conecta

```bash
# 1. Verificar que están en la misma WiFi
# 2. Verificar la IP del servidor
hostname -I

# 3. Usar esa IP desde la tablet
http://192.168.1.100:5000
```

---

## 🔐 SEGURIDAD EN PRODUCCIÓN

Para agregar seguridad a tu sistema:

### 1. Usar Variables de Entorno Seguras

```bash
# Nunca commitar archivos .env a Git
echo ".env" >> .gitignore
```

### 2. Habilitar HTTPS

Si usas Heroku, ya viene con HTTPS automático.

```
https://bodega-candinho.herokuapp.com
```

### 3. Proteger la API con Contraseña (Opcional)

Agregar a `server.js`:

```javascript
const basicAuth = require('basic-auth');

app.use((req, res, next) => {
    const credentials = basicAuth(req);
    if (!credentials || credentials.name !== 'admin' || credentials.pass !== 'tu-contraseña') {
        return res.status(401).json({ error: 'Autenticación requerida' });
    }
    next();
});
```

---

## 📝 PRÓXIMAS MEJORAS POSIBLES

- [ ] Agregar autenticación de usuario
- [ ] Notificaciones por email/SMS
- [ ] Integración con scanner de código QR real
- [ ] App móvil nativa (iOS/Android)
- [ ] Análisis predictivo de stock
- [ ] Integración con sistemas de temperatura/humedad
- [ ] Backup automático de base de datos

---

## 📞 SOPORTE

Si tienes problemas:

1. Revisar logs: `heroku logs --tail`
2. Revisar consola del navegador (F12)
3. Verificar variables de entorno
4. Reiniciar la aplicación

---

## ✨ ¡LISTO!

Tu sistema está listo para usar. Accede desde:

- **Local:** http://localhost:5000
- **Tablet local:** http://192.168.1.X:5000
- **Cloud:** https://bodega-candinho.herokuapp.com

**¡Que disfrutes gestionar tu bodega!** 🍷
