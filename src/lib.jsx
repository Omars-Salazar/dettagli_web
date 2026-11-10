import { useEffect, useState } from 'react';

export async function call(canal, datos) {
  if (!window.api) throw new Error('Abre la app con "npm run dev" (Electron), no desde el navegador.');
  const r = await window.api.invoke(canal, datos);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
export const money = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v || 0);

export function Modal({ title, onClose, wide, children }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <header><h2>{title}</h2><button className="ghost" onClick={onClose} aria-label="Cerrar">✕</button></header>
        {children}
      </div>
    </div>
  );
}

// Select de categorías con alta rápida
export function Cat({ value, onChange }) {
  const [list, setList] = useState([]);
  const [nuevo, setNuevo] = useState(null);
  const load = () => call('cat:list').then(setList);
  useEffect(() => { load(); }, []);
  const add = () => call('cat:add', { nombre: nuevo }).then(async (id) => { await load(); onChange(id); setNuevo(null); }).catch((e) => alert(e.message));
  return nuevo === null ? (
    <div className="row">
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">Sin categoría</option>
        {list.map((c) => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
      </select>
      <button type="button" className="ghost" onClick={() => setNuevo('')}>Nueva</button>
    </div>
  ) : (
    <div className="row">
      <input autoFocus value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre de la categoría" />
      <button type="button" onClick={add}>Guardar</button>
    </div>
  );
}
