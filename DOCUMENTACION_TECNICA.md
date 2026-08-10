# 🍷 BODEGA DE CANDINHO - DOCUMENTACIÓN TÉCNICA

---

## 📚 ÍNDICE

1. [Arquitectura General](#arquitectura-general)
2. [Base de Datos](#base-de-datos)
3. [API REST](#api-rest)
4. [Frontend](#frontend)
5. [Flujos de Negocio](#flujos-de-negocio)
6. [Funcionalidades Implementadas](#funcionalidades-implementadas)

---

## 🏗️ ARQUITECTURA GENERAL

```
┌─────────────────────────────────────────────────┐
│         TABLET / NAVEGADOR WEB                  │
│  (React - Interfaz responsiva)                  │
└──────────────────┬──────────────────────────────┘
                   │
                   │ HTTP/HTTPS
                   ↓
┌─────────────────────────────────────────────────┐
│      SERVIDOR NODE.JS + EXPRESS                 │
│  (API REST - Puerto 5000)                       │
└──────────────────┬──────────────────────────────┘
                   │
                   │ SQL
                   ↓
┌─────────────────────────────────────────────────┐
│    BASE DE DATOS POSTGRESQL                     │
│  (Cloud - Heroku, RDS, etc.)                    │
└─────────────────────────────────────────────────┘
```

**Componentes:**
- **Frontend:** React + CSS (Responsivo)
- **Backend:** Node.js + Express
- **Base de Datos:** PostgreSQL
- **Autenticación:** Por construir (opcional)

---

## 🗄️ BASE DE DATOS

### Tablas Principales

#### 1. **paises**
```sql
id (PK)
nombre (UNIQUE)
codigo_iso (UNIQUE)
```
Almacena países productores de vino.

#### 2. **regiones**
```sql
id (PK)
pais_id (FK → paises)
nombre
```
Regiones vinícolasde cada país (Champagne, Bordeaux, etc.)

#### 3. **tipos_vino**
```sql
id (PK)
nombre (UNIQUE)
```
Tipos: Tinto, Blanco, Rosado

#### 4. **zonas**
```sql
id (PK)
nombre (UNIQUE)  -- A1, A2, B1, B2, C1, C2, D1, D2
columnas
filas
```

#### 5. **ubicaciones**
```sql
id (PK)
zona_id (FK → zonas)
columna
fila
disponible (boolean)
```
Posiciones exactas en la bodega.

#### 6. **vinos**
```sql
id (PK)
codigo_qr (UNIQUE) -- UUID generado automáticamente
tipo_vino_id (FK → tipos_vino)
pais_id (FK → paises)
region_id (FK → regiones, NULLABLE)
bodega
ano
cantidad
cantidad_minima
ubicacion_id (FK → ubicaciones)
estado (Disponible/Reservado/Dañado)
fecha_ingreso (TIMESTAMP)
notas (TEXT)
```

#### 7. **movimientos**
```sql
id (PK)
vino_id (FK → vinos)
tipo_movimiento (Entrada/Salida)
cantidad
fecha_movimiento (TIMESTAMP)
notas
```

#### 8. **configuracion**
```sql
id (PK)
nombre_bodega
columnas_por_zona
filas_por_zona
fecha_actualizacion
```

### Índices para Performance

```sql
CREATE INDEX idx_vinos_tipo ON vinos(tipo_vino_id);
CREATE INDEX idx_vinos_pais ON vinos(pais_id);
CREATE INDEX idx_vinos_estado ON vinos(estado);
CREATE INDEX idx_vinos_codigo_qr ON vinos(codigo_qr);
CREATE INDEX idx_movimientos_vino ON movimientos(vino_id);
CREATE INDEX idx_ubicaciones_zona ON ubicaciones(zona_id);
```

---

## 🔌 API REST

### Endpoints Implementados

#### **PAÍSES Y REGIONES**

```
GET /api/paises
Retorna lista de todos los países

GET /api/paises/:pais_id/regiones
Retorna regiones de un país específico
```

#### **TIPOS DE VINO**

```
GET /api/tipos-vino
Retorna tipos (Tinto, Blanco, Rosado)
```

#### **ZONAS**

```
GET /api/zonas
Retorna configuración de todas las zonas (A1-D2)
```

#### **VINOS**

```
POST /api/vinos
Crear nuevo vino

Parámetros:
{
  "tipo_vino_id": 1,
  "pais_id": 1,
  "region_id": 1,
  "bodega": "Château Latour",
  "ano": 2015,
  "cantidad": 1,
  "cantidad_minima": 0,
  "notas": "Opcional"
}

Respuesta:
{
  "id": 1,
  "codigo_qr": "uuid-generado",
  "qr_image": "data:image/png;base64,..."
}
```

```
GET /api/vinos
Obtener todos los vinos (con filtros opcionales)

Parámetros query:
?tipo=1&pais=1&region=1&ano=2015&bodega=Latour

Respuesta:
[
  {
    "id": 1,
    "codigo_qr": "...",
    "tipo_nombre": "Tinto",
    "bodega": "Château Latour",
    "pais_nombre": "Francia",
    "region_nombre": "Bordeaux",
    "ano": 2015,
    "cantidad": 1,
    "zona_nombre": "A1",
    "columna": 1,
    "fila": 1
  }
]
```

```
GET /api/vinos/qr/:codigo_qr
Obtener vino por código QR
```

```
GET /api/vinos/:id
Obtener vino específico por ID
```

```
POST /api/vinos/:id/salida
Registrar salida de vino

Parámetros:
{
  "cantidad": 1,
  "notas": "Opcional"
}
```

#### **MOVIMIENTOS**

```
GET /api/movimientos
Obtener últimos 100 movimientos (entrada/salida)

Respuesta:
[
  {
    "id": 1,
    "vino_id": 1,
    "tipo_movimiento": "Entrada",
    "cantidad": 1,
    "fecha_movimiento": "2024-01-15T10:30:00Z",
    "codigo_qr": "...",
    "tipo_nombre": "Tinto",
    "bodega": "Château Latour"
  }
]
```

#### **REPORTES**

```
GET /api/reportes/resumen
Obtener resumen estadístico de la bodega

Respuesta:
{
  "total_botellas": 4000,
  "por_tipo": [
    {"nombre": "Tinto", "cantidad": 2500},
    {"nombre": "Blanco", "cantidad": 1200},
    {"nombre": "Rosado", "cantidad": 300}
  ],
  "por_pais": [
    {"nombre": "Francia", "cantidad": 2000},
    {"nombre": "Italia", "cantidad": 1500},
    ...
  ],
  "por_region": [
    {"nombre": "Champagne", "pais": "Francia", "cantidad": 500},
    ...
  ]
}
```

#### **CONFIGURACIÓN**

```
GET /api/configuracion
Obtener configuración de la bodega
```

#### **HEALTH CHECK**

```
GET /health
Verifica que el servidor está funcionando

Respuesta: {"status": "OK", "timestamp": "..."}
```

---

## 💻 FRONTEND

### Estructura de Componentes React

```
App
├── Header
├── Navigation
└── Content (según página activa)
    ├── PaginaInicio
    ├── EntradaVino
    ├── SalidaVino
    ├── BuscarVino
    ├── InventarioGeneral
    └── Reportes
```

### Páginas Implementadas

#### 1. **Inicio**
- Bienvenida
- Acciones rápidas
- Características del sistema

#### 2. **Entrada de Vino**
- Formulario para registrar nuevo vino
- Selección: Tipo → País → Región → Bodega → Año
- Generación automática de código QR
- Asignación automática de ubicación
- Visualización del QR generado

#### 3. **Salida de Vino**
- Búsqueda de vino por bodega
- Visualización de ubicación
- Ingreso de cantidad a retirar
- Confirmación de salida

#### 4. **Buscar Vino**
- Filtros avanzados (tipo, país, región, año)
- Visualización de resultados
- Información de ubicación exacta
- Stock disponible

#### 5. **Inventario General**
- Total de botellas
- Total de SKUs diferentes
- Tabla detallada de inventario
- Ordenamiento por tipo/región/año

#### 6. **Reportes**
- Total de botellas
- Distribución por tipo (gráfico)
- Top 10 países
- Top 15 regiones
- Gráficos de progreso

---

## 📱 RESPONSIVIDAD

El sistema está optimizado para:

- **Tablet:** 768px - 1024px
- **PC:** 1024px+
- **Mobile pequeño:** <480px

### CSS Media Queries
```css
@media (max-width: 479px) { /* Móvil */ }
@media (min-width: 768px) { /* Tablet */ }
@media (min-width: 1024px) { /* Desktop */ }
```

---

## 🔄 FLUJOS DE NEGOCIO

### Flujo 1: ENTRADA DE VINO

```
1. Usuario abre "Entrada de Vino"
   ↓
2. Completa formulario
   - Tipo (Tinto/Blanco/Rosado)
   - País
   - Región (opcional)
   - Bodega
   - Año
   - Cantidad
   - Cantidad mínima
   ↓
3. Sistema valida datos
   ↓
4. Genera UUID único para código QR
   ↓
5. Busca ubicación disponible (Zona-Columna-Fila)
   ↓
6. Crea registro en tabla VINOS
   ↓
7. Marca ubicación como NO disponible
   ↓
8. Crea registro en MOVIMIENTOS (Entrada)
   ↓
9. Genera imagen QR
   ↓
10. Muestra QR al usuario
    ↓
11. Usuario imprime QR y etiqueta la botella
```

### Flujo 2: CONSULTA DE VINO

```
1. Usuario busca vino (por bodega, tipo, región, año)
   ↓
2. Sistema filtra en tabla VINOS
   ↓
3. Retorna resultados con:
   - Tipo exacto
   - Bodega
   - Región
   - Año
   - Cantidad disponible
   - Ubicación exacta (Zona-Columna-Fila)
```

### Flujo 3: SALIDA DE VINO

```
1. Usuario busca vino a retirar
   ↓
2. Selecciona cantidad
   ↓
3. Sistema verifica stock
   ↓
4. Actualiza cantidad en VINOS
   ↓
5. Crea registro en MOVIMIENTOS (Salida)
   ↓
6. Confirma operación
```

---

## ✨ FUNCIONALIDADES IMPLEMENTADAS

### ✅ Núcleo

- [x] Registro de vinos con detalles completos
- [x] Generación automática de códigos QR únicos
- [x] Asignación automática de ubicación
- [x] Sistema de 8 zonas (A1-D2) con 20-30 columnas y 40 filas
- [x] Búsqueda avanzada por tipo/país/región/año
- [x] Visualización de ubicación exacta
- [x] Registro de entrada/salida
- [x] Control de cantidad mínima

### ✅ Interfaz

- [x] Interfaz responsiva (Tablet + PC)
- [x] Menú navegación intuitivo
- [x] Formularios amigables
- [x] Visualización de resultados en tabla y tarjetas
- [x] Dashboard con estadísticas

### ✅ Reportes

- [x] Total de botellas
- [x] Distribución por tipo de vino
- [x] Top 10 países productores
- [x] Top 15 regiones vinícolasls
- [x] Gráficos de progreso

### ✅ Base de Datos

- [x] Estructura normalizada
- [x] Índices para performance
- [x] Relaciones entre tablas
- [x] Datos iniciales precargados

### ✅ API

- [x] RESTful completa
- [x] Endpoints para todas operaciones
- [x] Validación de datos
- [x] Manejo de errores
- [x] CORS habilitado

---

## 🎯 PRÓXIMAS CARACTERÍSTICAS (Futuro)

### Por Implementar

- [ ] **Autenticación de usuario**
  - Login/Password
  - Roles (Admin/Usuario)

- [ ] **Escaneo de QR en tiempo real**
  - Desde cámara de tablet
  - Lectura automática

- [ ] **Control de temperatura/humedad**
  - Sensores IoT
  - Alertas
  - Gráficos históricos

- [ ] **Notificaciones**
  - Stock bajo
  - Vinos próximos a vencer (si se agrega fecha consumo)
  - Anomalías de temperatura

- [ ] **Exportación de reportes**
  - PDF
  - Excel
  - CSV

- [ ] **Historial detallado**
  - Quién movió qué vino
  - Timestamps de cada acción
  - Auditoría completa

- [ ] **Categorías personalizadas**
  - Colecciones privadas
  - Vinos favoritos
  - Etiquetas personalizadas

- [ ] **Integración mobile**
  - App Android
  - App iOS

- [ ] **Análisis predictivo**
  - Tendencias de consumo
  - Recomendaciones de organización
  - Predicción de rotación

---

## 🔐 CONSIDERACIONES DE SEGURIDAD

### Implementadas

- [x] SQL Injection: Prepared statements
- [x] CORS habilitado
- [x] Variables de entorno para credenciales
- [x] Validación de entrada

### A Implementar

- [ ] Autenticación OAuth2/JWT
- [ ] Encriptación de contraseñas
- [ ] Auditoría de acciones
- [ ] Rate limiting en API
- [ ] HTTPS forzado

---

## 📊 ESTADÍSTICAS DEL PROYECTO

- **Líneas de código:** ~1,500 (Backend) + ~1,000 (Frontend)
- **Tablas de BD:** 8
- **Endpoints API:** 15+
- **Componentes React:** 6
- **Países precargados:** 15
- **Regiones precargadas:** 30+
- **Zonas de bodega:** 8 (20 filas cada una)
- **Capacidad total:** 4,000 botellas

---

## 🚀 PERFORMANCE

### Optimizaciones Implementadas

- Índices en campos frecuentemente consultados
- Lazy loading en búsquedas
- Caché en navegador
- Compresión de respuestas
- Queries optimizadas

### Tiempos de Respuesta (Esperados)

- Crear vino: <200ms
- Buscar vino: <100ms
- Obtener resumen: <300ms
- Registrar salida: <150ms

---

## 📝 NOTAS IMPORTANTES

1. **Códigos QR:** Son UUIDs únicos generados automáticamente. No se repiten.
2. **Ubicaciones:** Se asignan automáticamente. La bodega tiene 4,000 posiciones (para 8 zonas de 20 filas cada una).
3. **Base de datos:** Se recomienda backup diario en producción.
4. **Escalabilidad:** El sistema puede manejar fácilmente 10,000+ botellas si se agregan más zonas.

---

## 🎓 CÓMO PERSONALIZAR

### Agregar un Nuevo País/Región

```sql
INSERT INTO paises (nombre, codigo_iso) VALUES ('Nuevo País', 'XX');
INSERT INTO regiones (pais_id, nombre) VALUES (id, 'Nueva Región');
```

### Cambiar Dimensiones de la Bodega

Editar tabla `zonas`:
```sql
UPDATE zonas SET columnas = 30, filas = 50 WHERE nombre = 'A1';
```

### Agregar un Nuevo Tipo de Vino

```sql
INSERT INTO tipos_vino (nombre) VALUES ('Espumante');
```

---

¡Sistema listo para producción! 🍷✨
