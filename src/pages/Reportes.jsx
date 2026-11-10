import { useState } from 'react';
import { call, money } from '../lib';

const iso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
const ESTADOS = {
  pendiente: 'Pendiente',
  en_preparacion: 'En preparación',
  listo: 'Listo',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

export default function Reportes({ notify }) {
  const [desde, setDesde] = useState(iso(firstOfMonth));
  const [hasta, setHasta] = useState(iso(today));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const generar = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try { setData(await call('rep:summary', { desde, hasta })); }
    catch (err) { notify(err.message, 'err'); }
    finally { setLoading(false); }
  };

  return (
    <>
      <div className="bar">
        <h2>Reportes</h2>
        <form className="report-filters" onSubmit={generar}>
          <label>Desde<input required type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input required type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
          <button disabled={loading}>{loading ? 'Generando…' : 'Generar reporte'}</button>
        </form>
      </div>

      {!data ? (
        <div className="empty-panel">Elige un rango de fechas y genera el reporte para ver el resumen.</div>
      ) : (
        <>
          <section className="metrics" aria-label="Resumen del periodo">
            <Metric label="Pedidos registrados" value={data.pedidos.pedidos} />
            <Metric label="Ventas no canceladas" value={money(data.pedidos.ventas)} />
            <Metric label="Pagos registrados" value={money(data.pagos.recaudado)} />
            <Metric label="Productos con stock bajo" value={data.stockBajo.length} />
          </section>

          <section className="report-grid">
            <div className="report-section">
              <h3>Pedidos por estado</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Estado</th><th className="n">Pedidos</th></tr></thead>
                  <tbody>
                    {Object.entries(ESTADOS).map(([estado, nombre]) => (
                      <tr key={estado}>
                        <td><span className={`status ${estado}`}>{nombre}</span></td>
                        <td className="n">{data.estados.find((r) => r.estado === estado)?.cantidad || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="report-section">
              <h3>Productos más vendidos</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>Producto</th><th className="n">Unidades</th><th className="n">Ventas</th></tr></thead>
                  <tbody>
                    {data.productos.map((p) => (
                      <tr key={p.id_producto}><td>{p.nombre}</td><td className="n">{p.unidades}</td><td className="n">{money(p.ventas)}</td></tr>
                    ))}
                    {!data.productos.length && <tr><td colSpan="3" className="empty">No hubo ventas en este periodo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="report-section report-section-wide">
              <h3>Productos con stock bajo</h3>
              <div className="table-scroll">
                <table>
                  <thead><tr><th>SKU</th><th>Producto</th><th className="n">Stock actual</th><th className="n">Mínimo</th></tr></thead>
                  <tbody>
                    {data.stockBajo.map((p) => (
                      <tr key={p.id_producto}><td>{p.sku || '—'}</td><td>{p.nombre}</td><td className="n"><span className="pill bad">{p.stock_actual}</span></td><td className="n">{p.stock_minimo}</td></tr>
                    ))}
                    {!data.stockBajo.length && <tr><td colSpan="4" className="empty">No hay productos activos con stock bajo.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
          <p className="report-note">Las ventas y los productos vendidos excluyen pedidos cancelados. Los pagos se cuentan por fecha de registro, incluso si pertenecen a un pedido cancelado; el sistema no registra devoluciones. El stock bajo corresponde al inventario actual.</p>
        </>
      )}
    </>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}
