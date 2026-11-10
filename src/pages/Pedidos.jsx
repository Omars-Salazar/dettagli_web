import { useEffect, useState } from 'react';
import { call, money, Modal } from '../lib';

const ESTADOS = { pendiente: 'Pendiente', en_preparacion: 'En preparación', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };

export default function Pedidos({ notify }) {
  const [rows, setRows] = useState([]);
  const [est, setEst] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const load = () => call('ped:list', { estado: est }).then(setRows).catch((e) => notify(e.message, 'err'));
  useEffect(() => { load(); }, [est]);

  const cambiar = async (id, estado) => {
    if (estado === 'cancelado' && !confirm('¿Cancelar este pedido? El stock se devolverá al inventario.')) return;
    try { await call('ped:estado', { id, estado }); load(); } catch (e) { notify(e.message, 'err'); }
  };

  return (
    <>
      <div className="bar">
        <h2>Pedidos</h2>
        <select value={est} onChange={(e) => setEst(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button onClick={() => setNuevo(true)}>Nuevo pedido</button>
      </div>
      <table>
        <thead><tr><th>N.°</th><th>Cliente</th><th>Entrega</th><th>Estado</th><th className="n">Total</th><th className="n">Saldo</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id_pedido}>
              <td>{p.id_pedido}</td><td>{p.cliente}</td><td>{p.fecha_entrega ?? 'Sin fecha'}</td>
              <td>
                <select className={`est ${p.estado}`} value={p.estado} disabled={p.estado === 'cancelado'} onChange={(e) => cambiar(p.id_pedido, e.target.value)}>
                  {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </td>
              <td className="n">{money(p.total)}</td>
              <td className="n">{p.estado === 'cancelado' ? '—' : money(p.total - p.pagado)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan="6" className="empty">Aún no hay pedidos. Usa "Nuevo pedido" para registrar el primero.</td></tr>}
        </tbody>
      </table>
      {nuevo && <Nuevo notify={notify} onClose={() => setNuevo(false)} onSaved={() => { setNuevo(false); notify('Pedido registrado'); load(); }} />}
    </>
  );
}

function Nuevo({ notify, onClose, onSaved }) {
  const [clientes, setClientes] = useState([]);
  const [prods, setProds] = useState([]);
  const [f, setF] = useState({ id_cliente: '', fecha_entrega: '', direccion_entrega: '', dedicatoria: '', notas: '', anticipo: 0, metodo: 'efectivo' });
  const [items, setItems] = useState([]);
  const [sel, setSel] = useState('');
  const [cant, setCant] = useState(1);
  const [rapido, setRapido] = useState(null);

  useEffect(() => {
    call('cli:list').then(setClientes);
    call('prod:list', { q: '' }).then((r) => setProds(r.filter((p) => p.stock_actual > 0)));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const total = items.reduce((a, i) => a + i.cantidad * i.precio_unitario, 0);

  const agregar = () => {
    const p = prods.find((x) => x.id_producto == sel);
    if (!p) return;
    const c = +cant || 1;
    setItems((it) => it.some((i) => i.id_producto === p.id_producto)
      ? it.map((i) => (i.id_producto === p.id_producto ? { ...i, cantidad: i.cantidad + c } : i))
      : [...it, { id_producto: p.id_producto, nombre: p.nombre, cantidad: c, precio_unitario: p.precio_venta }]);
  };
  const upd = (id, k, v) => setItems((it) => it.map((i) => (i.id_producto === id ? { ...i, [k]: +v } : i)));
  const crearCliente = async () => {
    try { const id = await call('cli:add', rapido); setClientes(await call('cli:list')); setF({ ...f, id_cliente: id }); setRapido(null); }
    catch (e) { notify(e.message, 'err'); }
  };
  const guardar = async (e) => {
    e.preventDefault();
    try { await call('ped:create', { ...f, anticipo: +f.anticipo || 0, items }); onSaved(); } catch (err) { notify(err.message, 'err'); }
  };

  return (
    <Modal title="Nuevo pedido" wide onClose={onClose}>
      <form onSubmit={guardar}>
        <label>Cliente
          {rapido === null ? (
            <div className="row">
              <select required value={f.id_cliente} onChange={set('id_cliente')}>
                <option value="">Elige un cliente</option>
                {clientes.map((c) => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ''}</option>)}
              </select>
              <button type="button" className="ghost" onClick={() => setRapido({ nombre: '', telefono: '' })}>Cliente nuevo</button>
            </div>
          ) : (
            <div className="row">
              <input autoFocus placeholder="Nombre" value={rapido.nombre} onChange={(e) => setRapido({ ...rapido, nombre: e.target.value })} />
              <input placeholder="Teléfono" value={rapido.telefono} onChange={(e) => setRapido({ ...rapido, telefono: e.target.value })} />
              <button type="button" onClick={crearCliente}>Guardar</button>
            </div>
          )}
        </label>
        <div className="grid">
          <label>Fecha de entrega<input type="date" value={f.fecha_entrega} onChange={set('fecha_entrega')} /></label>
          <label>Dirección de entrega<input value={f.direccion_entrega} onChange={set('direccion_entrega')} /></label>
        </div>
        <label>Dedicatoria / personalización<input value={f.dedicatoria} onChange={set('dedicatoria')} /></label>

        <div className="row add">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            <option value="">Agregar producto…</option>
            {prods.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre} (stock {p.stock_actual}) · {money(p.precio_venta)}</option>)}
          </select>
          <input type="number" min="1" value={cant} onChange={(e) => setCant(e.target.value)} style={{ width: 80 }} />
          <button type="button" onClick={agregar}>Agregar</button>
        </div>
        <table>
          <thead><tr><th>Producto</th><th className="n">Cantidad</th><th className="n">Precio</th><th className="n">Subtotal</th><th></th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id_producto}>
                <td>{i.nombre}</td>
                <td className="n"><input type="number" min="1" value={i.cantidad} onChange={(e) => upd(i.id_producto, 'cantidad', e.target.value)} /></td>
                <td className="n"><input type="number" min="0" value={i.precio_unitario} onChange={(e) => upd(i.id_producto, 'precio_unitario', e.target.value)} /></td>
                <td className="n">{money(i.cantidad * i.precio_unitario)}</td>
                <td><button type="button" className="ghost" onClick={() => setItems(items.filter((x) => x !== i))}>Quitar</button></td>
              </tr>
            ))}
            {!items.length && <tr><td colSpan="5" className="empty">Agrega los productos del pedido.</td></tr>}
          </tbody>
        </table>

        <div className="grid">
          <label>Anticipo<input type="number" min="0" value={f.anticipo} onChange={set('anticipo')} /></label>
          <label>Método de pago
            <select value={f.metodo} onChange={set('metodo')}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select>
          </label>
        </div>
        <footer>
          <strong className="total">Total {money(total)} · Saldo {money(total - (+f.anticipo || 0))}</strong>
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button>Registrar pedido</button>
        </footer>
      </form>
    </Modal>
  );
}
