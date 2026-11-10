import { useEffect, useState } from 'react';
import { call } from './lib';
import Clientes from './pages/Clientes';
import Inventario from './pages/Inventario';
import Pedidos from './pages/Pedidos';
import Reportes from './pages/Reportes';

export default function App() {
  const [page, setPage] = useState('inv');
  const [toast, setToast] = useState(null);
  const [err, setErr] = useState(null);
  const notify = (m, t = 'ok') => { setToast({ m, t }); setTimeout(() => setToast(null), 3500); };
  useEffect(() => { call('ping').catch((e) => setErr(e.message)); }, []);
  return (
    <div className="app">
      <nav>
        <h1>Regalos</h1>
        <button className={page === 'inv' ? 'on' : ''} onClick={() => setPage('inv')}>Inventario</button>
        <button className={page === 'ped' ? 'on' : ''} onClick={() => setPage('ped')}>Pedidos</button>
        <button className={page === 'cli' ? 'on' : ''} onClick={() => setPage('cli')}>Clientes</button>
        <button className={page === 'rep' ? 'on' : ''} onClick={() => setPage('rep')}>Reportes</button>
      </nav>
      <main>
        {err && <div className="banner">{err}</div>}
        {page === 'inv' && <Inventario notify={notify} />}
        {page === 'ped' && <Pedidos notify={notify} />}
        {page === 'cli' && <Clientes notify={notify} />}
        {page === 'rep' && <Reportes notify={notify} />}
      </main>
      {toast && <div className={`toast ${toast.t}`}>{toast.m}</div>}
    </div>
  );
}
