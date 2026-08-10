// ============================================
// BODEGA DE CANDINHO - FRONTEND REACT
// Interfaz responsiva para Tablet + PC
// ============================================

import React, { useState, useEffect, useRef } from 'react';
import './App.css';

// Componentes principales
const App = () => {
    const [currentPage, setCurrentPage] = useState('inicio');
    const [paises, setPaises] = useState([]);
    const [regiones, setRegiones] = useState([]);
    const [tiposVino, setTiposVino] = useState([]);
    const [zonas, setZonas] = useState([]);
    const [vinos, setVinos] = useState([]);
    const [resumen, setResumen] = useState(null);
    const [loading, setLoading] = useState(false);
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    // Cargar datos iniciales
    useEffect(() => {
        cargarDatos();
    }, []);

    const cargarDatos = async () => {
        setLoading(true);
        try {
            const [paisesRes, tiposRes, zonasRes] = await Promise.all([
                fetch(`${API_URL}/api/paises`),
                fetch(`${API_URL}/api/tipos-vino`),
                fetch(`${API_URL}/api/zonas`)
            ]);

            setPaises(await paisesRes.json());
            setTiposVino(await tiposRes.json());
            setZonas(await zonasRes.json());
        } catch (error) {
            console.error('Error cargando datos:', error);
            alert('Error al conectar con el servidor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="app">
            <Header />
            {loading && <div className="spinner">Cargando...</div>}
            {!loading && (
                <>
                    <Navigation currentPage={currentPage} setCurrentPage={setCurrentPage} />
                    <main className="content">
                        {currentPage === 'inicio' && <PaginaInicio />}
                        {currentPage === 'entrada' && <EntradaVino paises={paises} regiones={regiones} setRegiones={setRegiones} tiposVino={tiposVino} API_URL={API_URL} />}
                        {currentPage === 'salida' && <SalidaVino vinos={vinos} setVinos={setVinos} API_URL={API_URL} />}
                        {currentPage === 'buscar' && <BuscarVino paises={paises} regiones={regiones} setRegiones={setRegiones} tiposVino={tiposVino} vinos={vinos} setVinos={setVinos} API_URL={API_URL} />}
                        {currentPage === 'inventario' && <InventarioGeneral API_URL={API_URL} />}
                        {currentPage === 'reportes' && <Reportes API_URL={API_URL} />}
                    </main>
                </>
            )}
        </div>
    );
};

// Header
const Header = () => (
    <header className="header">
        <div className="header-content">
            <h1>🍷 Bodega de Candinho</h1>
            <p>Sistema de Gestión de Inventario</p>
        </div>
    </header>
);

// Navegación
const Navigation = ({ currentPage, setCurrentPage }) => (
    <nav className="navigation">
        <button 
            className={`nav-btn ${currentPage === 'inicio' ? 'active' : ''}`}
            onClick={() => setCurrentPage('inicio')}
        >
            🏠 Inicio
        </button>
        <button 
            className={`nav-btn ${currentPage === 'entrada' ? 'active' : ''}`}
            onClick={() => setCurrentPage('entrada')}
        >
            ➕ Entrada
        </button>
        <button 
            className={`nav-btn ${currentPage === 'salida' ? 'active' : ''}`}
            onClick={() => setCurrentPage('salida')}
        >
            ➖ Salida
        </button>
        <button 
            className={`nav-btn ${currentPage === 'buscar' ? 'active' : ''}`}
            onClick={() => setCurrentPage('buscar')}
        >
            🔍 Buscar
        </button>
        <button 
            className={`nav-btn ${currentPage === 'inventario' ? 'active' : ''}`}
            onClick={() => setCurrentPage('inventario')}
        >
            📊 Inventario
        </button>
        <button 
            className={`nav-btn ${currentPage === 'reportes' ? 'active' : ''}`}
            onClick={() => setCurrentPage('reportes')}
        >
            📈 Reportes
        </button>
    </nav>
);

// Página Inicio
const PaginaInicio = () => (
    <div className="page-inicio">
        <div className="card welcome-card">
            <h2>Bienvenido a Bodega de Candinho</h2>
            <p>Sistema de Gestión Inteligente de Vinos</p>
            
            <div className="quick-actions">
                <div className="action-item">
                    <span className="action-icon">➕</span>
                    <h3>Registrar Entrada</h3>
                    <p>Agregar nuevas botellas a la bodega</p>
                </div>
                <div className="action-item">
                    <span className="action-icon">➖</span>
                    <h3>Registrar Salida</h3>
                    <p>Retirar botellas de la bodega</p>
                </div>
                <div className="action-item">
                    <span className="action-icon">🔍</span>
                    <h3>Buscar Vino</h3>
                    <p>Encontrar ubicación de cualquier botella</p>
                </div>
                <div className="action-item">
                    <span className="action-icon">📊</span>
                    <h3>Ver Inventario</h3>
                    <p>Estado completo de la bodega</p>
                </div>
            </div>

            <div className="info-box">
                <h3>Características</h3>
                <ul>
                    <li>✓ Identificación con código QR</li>
                    <li>✓ Ubicación automática de vinos</li>
                    <li>✓ Búsqueda por tipo, región y año</li>
                    <li>✓ Historial de movimientos</li>
                    <li>✓ Reportes por tipo y variedad</li>
                </ul>
            </div>
        </div>
    </div>
);

// Entrada de Vino
const EntradaVino = ({ paises, regiones, setRegiones, tiposVino, API_URL }) => {
    const [formData, setFormData] = useState({
        tipo_vino_id: '',
        pais_id: '',
        region_id: '',
        bodega: '',
        ano: new Date().getFullYear(),
        cantidad: 1,
        cantidad_minima: 0,
        notas: ''
    });
    const [qrGenerado, setQrGenerado] = useState(null);
    const [vinoRegistrado, setVinoRegistrado] = useState(null);

    const handlePaisChange = async (e) => {
        const pais_id = e.target.value;
        setFormData({ ...formData, pais_id, region_id: '' });
        
        if (pais_id) {
            const res = await fetch(`${API_URL}/api/paises/${pais_id}/regiones`);
            setRegiones(await res.json());
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.tipo_vino_id || !formData.pais_id || !formData.bodega || !formData.ano) {
            alert('Por favor completa todos los campos obligatorios');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/vinos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!res.ok) throw new Error('Error al registrar vino');

            const vino = await res.json();
            setVinoRegistrado(vino);
            setQrGenerado(vino.qr_image);
            setFormData({
                tipo_vino_id: '',
                pais_id: '',
                region_id: '',
                bodega: '',
                ano: new Date().getFullYear(),
                cantidad: 1,
                cantidad_minima: 0,
                notas: ''
            });
            setRegiones([]);

            setTimeout(() => {
                setVinoRegistrado(null);
                setQrGenerado(null);
            }, 5000);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    return (
        <div className="page-entrada">
            <h2>Registrar Entrada de Vino</h2>
            
            {qrGenerado && (
                <div className="qr-success">
                    <h3>✓ Vino Registrado Exitosamente</h3>
                    <img src={qrGenerado} alt="QR Code" className="qr-code-large" />
                    <p>Código: {vinoRegistrado?.codigo_qr}</p>
                    <p>Ubicación: {vinoRegistrado?.zona_nombre}-{vinoRegistrado?.columna}-{vinoRegistrado?.fila}</p>
                    <button onClick={() => { setQrGenerado(null); setVinoRegistrado(null); }}>Cerrar</button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="form-entrada">
                <div className="form-group">
                    <label>Tipo de Vino *</label>
                    <select 
                        value={formData.tipo_vino_id}
                        onChange={(e) => setFormData({ ...formData, tipo_vino_id: e.target.value })}
                        required
                    >
                        <option value="">Selecciona tipo</option>
                        {tiposVino.map(t => (
                            <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>País *</label>
                    <select 
                        value={formData.pais_id}
                        onChange={handlePaisChange}
                        required
                    >
                        <option value="">Selecciona país</option>
                        {paises.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                    </select>
                </div>

                {regiones.length > 0 && (
                    <div className="form-group">
                        <label>Región</label>
                        <select 
                            value={formData.region_id}
                            onChange={(e) => setFormData({ ...formData, region_id: e.target.value })}
                        >
                            <option value="">Selecciona región (opcional)</option>
                            {regiones.map(r => (
                                <option key={r.id} value={r.id}>{r.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="form-group">
                    <label>Bodega/Productor *</label>
                    <input 
                        type="text"
                        value={formData.bodega}
                        onChange={(e) => setFormData({ ...formData, bodega: e.target.value })}
                        placeholder="Ej: Château Latour"
                        required
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Año *</label>
                        <input 
                            type="number"
                            value={formData.ano}
                            onChange={(e) => setFormData({ ...formData, ano: parseInt(e.target.value) })}
                            min="1900"
                            max={new Date().getFullYear()}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Cantidad</label>
                        <input 
                            type="number"
                            value={formData.cantidad}
                            onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value) })}
                            min="1"
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label>Cantidad Mínima</label>
                    <input 
                        type="number"
                        value={formData.cantidad_minima}
                        onChange={(e) => setFormData({ ...formData, cantidad_minima: parseInt(e.target.value) })}
                        min="0"
                    />
                </div>

                <div className="form-group">
                    <label>Notas</label>
                    <textarea 
                        value={formData.notas}
                        onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
                        placeholder="Observaciones adicionales..."
                    />
                </div>

                <button type="submit" className="btn-primary">Registrar Vino</button>
            </form>
        </div>
    );
};

// Salida de Vino
const SalidaVino = ({ vinos, setVinos, API_URL }) => {
    const [busqueda, setBusqueda] = useState('');
    const [vinoSeleccionado, setVinoSeleccionado] = useState(null);
    const [cantidad, setCantidad] = useState(1);

    const buscarVino = async (valor) => {
        setBusqueda(valor);
        if (valor.length > 2) {
            const res = await fetch(`${API_URL}/api/vinos?bodega=${valor}`);
            setVinos(await res.json());
        }
    };

    const registrarSalida = async () => {
        if (!vinoSeleccionado || cantidad > vinoSeleccionado.cantidad) {
            alert('Cantidad inválida');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/vinos/${vinoSeleccionado.id}/salida`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad })
            });

            if (!res.ok) throw new Error('Error al registrar salida');

            alert(`✓ Salida registrada: ${cantidad} botella(s)`);
            setVinoSeleccionado(null);
            setCantidad(1);
            setBusqueda('');
            setVinos([]);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    };

    return (
        <div className="page-salida">
            <h2>Registrar Salida de Vino</h2>
            
            <div className="search-section">
                <input
                    type="text"
                    placeholder="Busca por bodega/productor..."
                    value={busqueda}
                    onChange={(e) => buscarVino(e.target.value)}
                    className="search-input"
                />

                {vinos.length > 0 && (
                    <div className="search-results">
                        {vinos.map(v => (
                            <div 
                                key={v.id} 
                                className={`vino-item ${vinoSeleccionado?.id === v.id ? 'selected' : ''}`}
                                onClick={() => setVinoSeleccionado(v)}
                            >
                                <div>
                                    <strong>{v.tipo_nombre}</strong> | {v.bodega} ({v.ano})
                                    <br/>
                                    <small>{v.region_nombre ? v.region_nombre + ', ' : ''}{v.pais_nombre}</small>
                                </div>
                                <div className="cantidad">Disponible: {v.cantidad}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {vinoSeleccionado && (
                <div className="salida-form">
                    <div className="vino-details">
                        <h3>Vino Seleccionado</h3>
                        <p><strong>{vinoSeleccionado.tipo_nombre}</strong></p>
                        <p>{vinoSeleccionado.bodega} ({vinoSeleccionado.ano})</p>
                        <p>{vinoSeleccionado.region_nombre}, {vinoSeleccionado.pais_nombre}</p>
                        <p className="ubicacion">Ubicación: {vinoSeleccionado.zona_nombre}-{vinoSeleccionado.columna}-{vinoSeleccionado.fila}</p>
                        <p className="stock">Stock disponible: {vinoSeleccionado.cantidad}</p>
                    </div>

                    <div className="salida-cantidad">
                        <label>Cantidad a retirar:</label>
                        <input 
                            type="number"
                            min="1"
                            max={vinoSeleccionado.cantidad}
                            value={cantidad}
                            onChange={(e) => setCantidad(parseInt(e.target.value))}
                        />
                    </div>

                    <button className="btn-primary" onClick={registrarSalida}>Confirmar Salida</button>
                </div>
            )}
        </div>
    );
};

// Buscar Vino
const BuscarVino = ({ paises, regiones, setRegiones, tiposVino, vinos, setVinos, API_URL }) => {
    const [filtros, setFiltros] = useState({
        tipo: '',
        pais: '',
        region: '',
        ano: ''
    });

    const buscar = async () => {
        const params = new URLSearchParams();
        if (filtros.tipo) params.append('tipo', filtros.tipo);
        if (filtros.pais) params.append('pais', filtros.pais);
        if (filtros.region) params.append('region', filtros.region);
        if (filtros.ano) params.append('ano', filtros.ano);

        const res = await fetch(`${API_URL}/api/vinos?${params}`);
        setVinos(await res.json());
    };

    const handlePaisChange = async (pais_id) => {
        setFiltros({ ...filtros, pais: pais_id, region: '' });
        if (pais_id) {
            const res = await fetch(`${API_URL}/api/paises/${pais_id}/regiones`);
            setRegiones(await res.json());
        }
    };

    return (
        <div className="page-buscar">
            <h2>Buscar Vino</h2>

            <div className="filtros">
                <div className="form-group">
                    <label>Tipo</label>
                    <select 
                        value={filtros.tipo}
                        onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}
                    >
                        <option value="">Todos</option>
                        {tiposVino.map(t => (
                            <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>País</label>
                    <select 
                        value={filtros.pais}
                        onChange={(e) => handlePaisChange(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {paises.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                    </select>
                </div>

                {regiones.length > 0 && (
                    <div className="form-group">
                        <label>Región</label>
                        <select 
                            value={filtros.region}
                            onChange={(e) => setFiltros({ ...filtros, region: e.target.value })}
                        >
                            <option value="">Todas</option>
                            {regiones.map(r => (
                                <option key={r.id} value={r.id}>{r.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="form-group">
                    <label>Año</label>
                    <input 
                        type="number"
                        value={filtros.ano}
                        onChange={(e) => setFiltros({ ...filtros, ano: e.target.value })}
                        placeholder="Ej: 2010"
                    />
                </div>

                <button className="btn-primary" onClick={buscar}>Buscar</button>
            </div>

            <div className="resultados">
                {vinos.length > 0 ? (
                    <>
                        <h3>Resultados ({vinos.length})</h3>
                        {vinos.map(v => (
                            <div key={v.id} className="resultado-item">
                                <div className="resultado-info">
                                    <strong>{v.tipo_nombre}</strong> - {v.bodega}
                                    <br/>
                                    <small>{v.region_nombre ? v.region_nombre + ', ' : ''}{v.pais_nombre} | {v.ano}</small>
                                </div>
                                <div className="resultado-ubicacion">
                                    <strong>Ubicación:</strong> {v.zona_nombre} - Col {v.columna}, Fila {v.fila}
                                    <br/>
                                    <strong>Stock:</strong> {v.cantidad} botellas
                                </div>
                            </div>
                        ))}
                    </>
                ) : (
                    <p className="no-results">No hay resultados. Intenta con otros filtros.</p>
                )}
            </div>
        </div>
    );
};

// Inventario General
const InventarioGeneral = ({ API_URL }) => {
    const [inventario, setInventario] = useState(null);

    useEffect(() => {
        cargarInventario();
    }, []);

    const cargarInventario = async () => {
        try {
            const res = await fetch(`${API_URL}/api/vinos`);
            const data = await res.json();
            setInventario(data);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    return (
        <div className="page-inventario">
            <h2>Inventario General</h2>
            
            {inventario ? (
                <>
                    <div className="stats-grid">
                        <div className="stat-card">
                            <div className="stat-value">{inventario.reduce((sum, v) => sum + v.cantidad, 0)}</div>
                            <div className="stat-label">Total de Botellas</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-value">{inventario.length}</div>
                            <div className="stat-label">Diferentes Vinos</div>
                        </div>
                    </div>

                    <div className="inventario-table">
                        <h3>Detalle por Vino</h3>
                        <table>
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Bodega</th>
                                    <th>Región/País</th>
                                    <th>Año</th>
                                    <th>Cantidad</th>
                                    <th>Ubicación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventario.map(v => (
                                    <tr key={v.id}>
                                        <td>{v.tipo_nombre}</td>
                                        <td>{v.bodega}</td>
                                        <td>{v.region_nombre || v.pais_nombre}</td>
                                        <td>{v.ano}</td>
                                        <td className="cantidad">{v.cantidad}</td>
                                        <td>{v.zona_nombre}-{v.columna}-{v.fila}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            ) : (
                <div className="spinner">Cargando...</div>
            )}
        </div>
    );
};

// Reportes
const Reportes = ({ API_URL }) => {
    const [resumen, setResumen] = useState(null);

    useEffect(() => {
        cargarResumen();
    }, []);

    const cargarResumen = async () => {
        try {
            const res = await fetch(`${API_URL}/api/reportes/resumen`);
            const data = await res.json();
            setResumen(data);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    return (
        <div className="page-reportes">
            <h2>Reportes</h2>

            {resumen ? (
                <>
                    <div className="reporte-section">
                        <h3>📊 Total de Botellas: {resumen.total_botellas}</h3>
                    </div>

                    <div className="reporte-section">
                        <h3>Por Tipo de Vino</h3>
                        {resumen.por_tipo.map(t => (
                            <div key={t.nombre} className="reporte-item">
                                <span>{t.nombre}</span>
                                <div className="progress-bar">
                                    <div className="progress" style={{ width: `${(t.cantidad / resumen.total_botellas) * 100}%` }}></div>
                                </div>
                                <span className="cantidad">{t.cantidad}</span>
                            </div>
                        ))}
                    </div>

                    <div className="reporte-section">
                        <h3>Top 10 Países</h3>
                        {resumen.por_pais.map(p => (
                            <div key={p.nombre} className="reporte-item">
                                <span>{p.nombre}</span>
                                <div className="progress-bar">
                                    <div className="progress" style={{ width: `${(p.cantidad / resumen.total_botellas) * 100}%` }}></div>
                                </div>
                                <span className="cantidad">{p.cantidad}</span>
                            </div>
                        ))}
                    </div>

                    <div className="reporte-section">
                        <h3>Top 15 Regiones</h3>
                        {resumen.por_region.map(r => (
                            <div key={r.nombre} className="reporte-item">
                                <span>{r.nombre} ({r.pais})</span>
                                <div className="progress-bar">
                                    <div className="progress" style={{ width: `${(r.cantidad / resumen.total_botellas) * 100}%` }}></div>
                                </div>
                                <span className="cantidad">{r.cantidad}</span>
                            </div>
                        ))}
                    </div>
                </>
            ) : (
                <div className="spinner">Cargando reportes...</div>
            )}
        </div>
    );
};

export default App;
