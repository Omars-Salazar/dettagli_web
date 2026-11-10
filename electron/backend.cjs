const { ipcMain } = require('electron');
const mysql = require('mysql2/promise');

let pool;
const db = () => (pool ||= mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'tienda_regalos',
  connectionLimit: 5, dateStrings: true, decimalNumbers: true,
}));
const q = async (sql, p = []) => (await db().query(sql, p))[0];
async function tx(fn) {
  const c = await db().getConnection();
  try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
  catch (e) { await c.rollback(); throw e; } finally { c.release(); }
}
const n = (v) => (v === '' || v == null ? null : v);
const fail = (m) => { throw new Error(m); };

const H = {
  ping: () => q('SELECT 1').then(() => true),

  'cat:list': () => q('SELECT * FROM categorias ORDER BY nombre'),
  'cat:add': async ({ nombre }) => (await q('INSERT INTO categorias (nombre) VALUES (?)', [nombre])).insertId,

  'prod:list': ({ q: t = '', soloBajo, inactivos }) => q(
    `SELECT p.*, c.nombre categoria FROM productos p LEFT JOIN categorias c USING (id_categoria)
     WHERE p.activo = ? AND (p.nombre LIKE ? OR p.sku LIKE ?) ${soloBajo ? 'AND p.stock_actual <= p.stock_minimo' : ''}
     ORDER BY p.nombre`, [inactivos ? 0 : 1, `%${t}%`, `%${t}%`]),

  'prod:save': ({ id_producto: id, stock_inicial = 0, ...p }) => tx(async (c) => {
    if (!p.nombre?.trim()) fail('El nombre es obligatorio.');
    const v = [n(p.sku), p.nombre.trim(), n(p.id_categoria), +p.costo || 0, +p.precio_venta || 0, +p.stock_minimo || 0];
    if (id) return c.query('UPDATE productos SET sku=?, nombre=?, id_categoria=?, costo=?, precio_venta=?, stock_minimo=? WHERE id_producto=?', [...v, id]);
    const [r] = await c.query('INSERT INTO productos (sku, nombre, id_categoria, costo, precio_venta, stock_minimo) VALUES (?,?,?,?,?,?)', v);
    if (+stock_inicial > 0) await c.query('CALL sp_entrada_stock(?,?,?)', [r.insertId, +stock_inicial, 'Stock inicial']);
  }),

  'prod:activo': ({ id, activo }) => q('UPDATE productos SET activo=? WHERE id_producto=?', [activo, id]),

  // tipo 'entrada' suma unidades; tipo 'ajuste' fija el stock al conteo físico
  'prod:stock': ({ id, tipo, cantidad, motivo }) => tx(async (c) => {
    const cant = +cantidad;
    if (tipo === 'entrada') {
      if (!(cant > 0)) fail('La cantidad debe ser mayor a 0.');
      return c.query('CALL sp_entrada_stock(?,?,?)', [id, cant, motivo || 'Compra']);
    }
    if (!(cant >= 0)) fail('Cantidad inválida.');
    const [[p]] = await c.query('SELECT stock_actual FROM productos WHERE id_producto=? FOR UPDATE', [id]);
    await c.query('UPDATE productos SET stock_actual=? WHERE id_producto=?', [cant, id]);
    await c.query("INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, motivo) VALUES (?, 'ajuste', ?, ?)", [id, cant - p.stock_actual, motivo || 'Conteo físico']);
  }),

  'prod:movs': ({ id }) => q('SELECT * FROM movimientos_inventario WHERE id_producto=? ORDER BY id_movimiento DESC LIMIT 100', [id]),

  'cli:list': () => q('SELECT * FROM clientes ORDER BY nombre'),
  'cli:add': async (c) => {
    if (!c.nombre?.trim()) fail('El nombre del cliente es obligatorio.');
    return (await q('INSERT INTO clientes (nombre, telefono, direccion) VALUES (?,?,?)', [c.nombre.trim(), n(c.telefono), n(c.direccion)])).insertId;
  },

  'ped:list': ({ estado = '' }) => q(
    `SELECT p.id_pedido, p.fecha_entrega, p.estado, p.total, c.nombre cliente,
            (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE id_pedido = p.id_pedido) pagado
     FROM pedidos p JOIN clientes c USING (id_cliente)
     WHERE ? = '' OR p.estado = ? ORDER BY p.id_pedido DESC LIMIT 200`, [estado, estado]),

  // Todo en una transacción: o se guarda el pedido completo o no se guarda nada
  'ped:create': ({ id_cliente, fecha_entrega, direccion_entrega, dedicatoria, notas, items, anticipo = 0, metodo = 'efectivo' }) => tx(async (c) => {
    if (!id_cliente) fail('Elige un cliente.');
    if (!items?.length) fail('Agrega al menos un producto.');
    let total = 0;
    for (const i of items) {
      const [[p]] = await c.query('SELECT nombre, stock_actual FROM productos WHERE id_producto=? FOR UPDATE', [i.id_producto]);
      if (!(i.cantidad > 0) || p.stock_actual < i.cantidad) fail(`Stock insuficiente de "${p.nombre}" (hay ${p.stock_actual}).`);
      total += i.cantidad * i.precio_unitario;
    }
    if (+anticipo > total) fail('El anticipo no puede superar el total.');
    const [r] = await c.query('INSERT INTO pedidos (id_cliente, fecha_entrega, direccion_entrega, dedicatoria, notas) VALUES (?,?,?,?,?)',
      [id_cliente, n(fecha_entrega), n(direccion_entrega), n(dedicatoria), n(notas)]);
    for (const i of items) await c.query('INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES (?,?,?,?)', [r.insertId, i.id_producto, i.cantidad, i.precio_unitario]);
    if (+anticipo > 0) await c.query('INSERT INTO pagos (id_pedido, monto, metodo) VALUES (?,?,?)', [r.insertId, +anticipo, metodo]);
    return r.insertId;
  }),

  'ped:estado': async ({ id, estado }) => {
    const [p] = await q('SELECT estado FROM pedidos WHERE id_pedido=?', [id]);
    if (p.estado === 'cancelado') fail('Un pedido cancelado no se puede reactivar.');
    await q('UPDATE pedidos SET estado=? WHERE id_pedido=?', [estado, id]); // el trigger devuelve el stock si es 'cancelado'
  },
};

const amable = (e) =>
  e.code === 'ER_DUP_ENTRY' ? 'Ya existe un registro con ese valor (¿SKU o nombre repetido?).'
  : ['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR'].includes(e.code)
    ? `No se pudo conectar a MySQL (${e.code}). Revisa el archivo .env y que el servicio MySQL esté activo.`
  : e.message;

exports.register = () => {
  for (const [canal, fn] of Object.entries(H)) {
    ipcMain.handle(canal, async (_e, datos) => {
      try { return { ok: true, data: await fn(datos || {}) }; }
      catch (e) { return { ok: false, error: amable(e) }; }
    });
  }
};
