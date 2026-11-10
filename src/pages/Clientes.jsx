import { useEffect, useState } from 'react';
import { call, money, Modal } from '../lib';

const vacio = {
  nombre: '', telefono: '', email: '', direccion: '', ciudad: '', fecha_cumpleanos: '', notas: '',
};

export default function Clientes({ notify }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = () => call('cli:list', { q: search }).then(setRows).catch((e) => notify(e.message, 'err'));
  useEffect(() => { load(); }, [search]);

  const openDetail = async (id) => {
    try { setDetail(await call('cli:detail', { id })); } catch (e) { notify(e.message, 'err'); }
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      await call('cli:save', form);
      notify(form.id_cliente ? 'Cliente actualizado' : 'Cliente guardado');
      setForm(null);
      load();
    } catch (err) { notify(err.message, 'err'); }
  };
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  return (
    <>
      <div className="bar">
        <h2>Clientes</h2>
        <input aria-label="Buscar clientes" placeholder="Buscar por nombre, teléfono o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={() => setForm({ ...vacio })}>Nuevo cliente</button>
      </div>

      <div className="table-scroll">
        <table>
          <thead><tr><th>Cliente</th><th>Teléfono</th><th>Correo</th><th>Ciudad</th><th className="n">Pedidos</th><th className="n">Compras</th><th></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id_cliente}>
                <td>{c.nombre}</td><td>{c.telefono || '—'}</td><td>{c.email || '—'}</td><td>{c.ciudad || '—'}</td>
                <td className="n">{c.pedidos}</td><td className="n">{money(c.total_comprado)}</td>
                <td className="acts">
                  <button className="ghost" onClick={() => openDetail(c.id_cliente)}>Historial</button>
                  <button className="ghost" onClick={() => setForm({ ...c })}>Editar</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="7" className="empty">No hay clientes para mostrar. Agrega el primero con “Nuevo cliente”.</td></tr>}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.id_cliente ? 'Editar cliente' : 'Nuevo cliente'} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            <label>Nombre<input required maxLength="120" autoFocus value={form.nombre} onChange={set('nombre')} /></label>
            <div className="grid">
              <label>Teléfono<input maxLength="30" value={form.telefono || ''} onChange={set('telefono')} /></label>
              <label>Correo electrónico<input type="email" maxLength="120" value={form.email || ''} onChange={set('email')} /></label>
              <label>Ciudad<input maxLength="80" value={form.ciudad || ''} onChange={set('ciudad')} /></label>
              <label>Fecha de cumpleaños<input type="date" value={form.fecha_cumpleanos ? String(form.fecha_cumpleanos).slice(0, 10) : ''} onChange={set('fecha_cumpleanos')} /></label>
            </div>
            <label>Dirección<input maxLength="255" value={form.direccion || ''} onChange={set('direccion')} /></label>
            <label>Notas<input maxLength="255" value={form.notas || ''} onChange={set('notas')} /></label>
            <footer>
              <button type="button" className="ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button>Guardar cliente</button>
            </footer>
          </form>
        </Modal>
      )}

      {detail && <Historial data={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function Historial({ data, onClose }) {
  const { cliente, pedidos } = data;
  return (
    <Modal title={`Historial: ${cliente.nombre}`} wide onClose={onClose}>
      <div className="client-summary">
        <span>{cliente.telefono || 'Sin teléfono'}</span>
        <span>{cliente.email || 'Sin correo'}</span>
        <span>{cliente.ciudad || cliente.direccion || 'Sin dirección registrada'}</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Entrega</th><th>Estado</th><th className="n">Total</th><th className="n">Pagado</th><th className="n">Saldo</th></tr></thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id_pedido}>
                <td>#{p.id_pedido}</td><td>{p.fecha_pedido}</td><td>{p.fecha_entrega || '—'}</td>
                <td><span className={`status ${p.estado}`}>{p.estado.replace('_', ' ')}</span></td>
                <td className="n">{money(p.total)}</td><td className="n">{money(p.pagado)}</td>
                <td className="n">{p.estado === 'cancelado' ? '—' : money(Math.max(0, p.total - p.pagado))}</td>
              </tr>
            ))}
            {!pedidos.length && <tr><td colSpan="7" className="empty">Este cliente todavía no tiene pedidos.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer><button type="button" className="ghost" onClick={onClose}>Cerrar</button></footer>
    </Modal>
  );
}
