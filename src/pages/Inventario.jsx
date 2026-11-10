import { useEffect, useState } from 'react';
import { call, money, Modal, Cat } from '../lib';

const vacio = { sku: '', nombre: '', id_categoria: '', costo: 0, precio_venta: 0, stock_minimo: 0, stock_inicial: 0 };

export default function Inventario({ notify }) {
  const [rows, setRows] = useState([]);
  const [t, setT] = useState('');
  const [bajo, setBajo] = useState(false);
  const [off, setOff] = useState(false);
  const [f, setF] = useState(null);   // formulario de producto
  const [s, setS] = useState(null);   // movimiento de stock
  const [h, setH] = useState(null);   // historial

  const load = () => call('prod:list', { q: t, soloBajo: bajo, inactivos: off }).then(setRows).catch((e) => notify(e.message, 'err'));
  useEffect(() => { load(); }, [t, bajo, off]);
  const run = async (canal, datos, ok, cerrar) => {
    try { await call(canal, datos); notify(ok); cerrar?.(); load(); } catch (e) { notify(e.message, 'err'); }
  };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="bar">
        <h2>Inventario</h2>
        <input placeholder="Buscar por nombre o SKU" value={t} onChange={(e) => setT(e.target.value)} />
        <label><input type="checkbox" checked={bajo} onChange={(e) => setBajo(e.target.checked)} /> Stock bajo</label>
        <label><input type="checkbox" checked={off} onChange={(e) => setOff(e.target.checked)} /> Desactivados</label>
        <button onClick={() => setF(vacio)}>Nuevo producto</button>
      </div>

      <table>
        <thead><tr><th>SKU</th><th>Producto</th><th>Categoría</th><th className="n">Costo</th><th className="n">Precio</th><th className="n">Stock</th><th></th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id_producto}>
              <td>{p.sku}</td><td>{p.nombre}</td><td>{p.categoria}</td>
              <td className="n">{money(p.costo)}</td><td className="n">{money(p.precio_venta)}</td>
              <td className="n"><span className={`pill ${p.stock_actual <= p.stock_minimo ? 'bad' : ''}`}>{p.stock_actual}</span></td>
              <td className="acts">
                <button className="ghost" onClick={() => setF({ ...p, id_categoria: p.id_categoria ?? '', sku: p.sku ?? '' })}>Editar</button>
                <button className="ghost" onClick={() => setS({ id: p.id_producto, nombre: p.nombre, tipo: 'entrada', cantidad: '', motivo: '' })}>Stock</button>
                <button className="ghost" onClick={async () => setH({ nombre: p.nombre, movs: await call('prod:movs', { id: p.id_producto }) })}>Historial</button>
                <button className="ghost" onClick={() => run('prod:activo', { id: p.id_producto, activo: off ? 1 : 0 }, off ? 'Producto reactivado' : 'Producto desactivado')}>{off ? 'Reactivar' : 'Desactivar'}</button>
              </td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="7" className="empty">No hay productos con ese filtro. Usa "Nuevo producto" para agregar el primero.</td></tr>}
        </tbody>
      </table>

      {f && (
        <Modal title={f.id_producto ? 'Editar producto' : 'Nuevo producto'} onClose={() => setF(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run('prod:save', f, 'Producto guardado', () => setF(null)); }}>
            <label>Nombre<input required value={f.nombre} onChange={set('nombre')} /></label>
            <label>SKU (opcional)<input value={f.sku} onChange={set('sku')} /></label>
            <label>Categoría<Cat value={f.id_categoria} onChange={(v) => setF({ ...f, id_categoria: v })} /></label>
            <div className="grid">
              <label>Costo<input type="number" min="0" value={f.costo} onChange={set('costo')} /></label>
              <label>Precio de venta<input type="number" min="0" value={f.precio_venta} onChange={set('precio_venta')} /></label>
              <label>Stock mínimo<input type="number" min="0" value={f.stock_minimo} onChange={set('stock_minimo')} /></label>
              {!f.id_producto && <label>Stock inicial<input type="number" min="0" value={f.stock_inicial} onChange={set('stock_inicial')} /></label>}
            </div>
            <footer><button type="button" className="ghost" onClick={() => setF(null)}>Cancelar</button><button>Guardar producto</button></footer>
          </form>
        </Modal>
      )}

      {s && (
        <Modal title={`Stock: ${s.nombre}`} onClose={() => setS(null)}>
          <form onSubmit={(e) => { e.preventDefault(); run('prod:stock', s, 'Stock actualizado', () => setS(null)); }}>
            <label>Tipo
              <select value={s.tipo} onChange={(e) => setS({ ...s, tipo: e.target.value })}>
                <option value="entrada">Entrada: sumar unidades que llegaron</option>
                <option value="ajuste">Ajuste: fijar el stock según conteo físico</option>
              </select>
            </label>
            <label>{s.tipo === 'entrada' ? 'Unidades que entran' : 'Stock real contado'}
              <input required type="number" min="0" value={s.cantidad} onChange={(e) => setS({ ...s, cantidad: e.target.value })} />
            </label>
            <label>Motivo (opcional)<input value={s.motivo} onChange={(e) => setS({ ...s, motivo: e.target.value })} /></label>
            <footer><button type="button" className="ghost" onClick={() => setS(null)}>Cancelar</button><button>Guardar movimiento</button></footer>
          </form>
        </Modal>
      )}

      {h && (
        <Modal title={`Historial: ${h.nombre}`} wide onClose={() => setH(null)}>
          <table>
            <thead><tr><th>Fecha</th><th>Tipo</th><th className="n">Cantidad</th><th>Motivo</th><th>Pedido</th></tr></thead>
            <tbody>
              {h.movs.map((m) => <tr key={m.id_movimiento}><td>{m.fecha}</td><td>{m.tipo}</td><td className="n">{m.cantidad}</td><td>{m.motivo}</td><td>{m.id_pedido ?? ''}</td></tr>)}
              {!h.movs.length && <tr><td colSpan="5" className="empty">Este producto aún no tiene movimientos.</td></tr>}
            </tbody>
          </table>
        </Modal>
      )}
    </>
  );
}
