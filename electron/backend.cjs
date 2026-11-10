const { app, ipcMain } = require('electron');
const mysql = require('mysql2/promise');
const path = require('path');

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
const dateRange = ({ desde, hasta }) => {
  const valid = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value < '1000-01-01') return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  if (!valid(desde) || !valid(hasta) || desde > hasta) {
    fail('El rango de fechas no es válido.');
  }
  return [desde, hasta];
};
const METODOS_PAGO = ['efectivo', 'transferencia', 'tarjeta', 'otro'];
const ESTADOS_PEDIDO = ['pendiente', 'en_preparacion', 'listo', 'entregado', 'cancelado'];

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

  'cli:list': ({ q: term = '' }) => q(
    `SELECT c.id_cliente, c.nombre, c.telefono, c.email, c.direccion, c.ciudad,
            c.fecha_cumpleanos, c.notas, c.creado_en,
            COUNT(CASE WHEN p.estado <> 'cancelado' THEN p.id_pedido END) pedidos,
            COALESCE(SUM(CASE WHEN p.estado <> 'cancelado' THEN p.total ELSE 0 END),0) total_comprado
     FROM clientes c LEFT JOIN pedidos p USING (id_cliente)
     WHERE c.nombre LIKE ? OR c.telefono LIKE ? OR c.email LIKE ?
     GROUP BY c.id_cliente ORDER BY c.nombre`,
    [`%${term}%`, `%${term}%`, `%${term}%`]),
  'cli:add': async (c) => {
    if (!c.nombre?.trim()) fail('El nombre del cliente es obligatorio.');
    return (await q('INSERT INTO clientes (nombre, telefono, direccion) VALUES (?,?,?)', [c.nombre.trim(), n(c.telefono), n(c.direccion)])).insertId;
  },
  'cli:save': async ({ id_cliente: id, nombre, telefono, email, direccion, ciudad, fecha_cumpleanos, notas }) => {
    if (!nombre?.trim()) fail('El nombre del cliente es obligatorio.');
    const values = [nombre.trim(), n(telefono), n(email), n(direccion), n(ciudad), n(fecha_cumpleanos), n(notas)];
    if (id) {
      await q('UPDATE clientes SET nombre=?, telefono=?, email=?, direccion=?, ciudad=?, fecha_cumpleanos=?, notas=? WHERE id_cliente=?', [...values, id]);
      return id;
    }
    return (await q('INSERT INTO clientes (nombre, telefono, email, direccion, ciudad, fecha_cumpleanos, notas) VALUES (?,?,?,?,?,?,?)', values)).insertId;
  },
  'cli:detail': async ({ id }) => {
    const [cliente] = await q('SELECT * FROM clientes WHERE id_cliente=?', [id]);
    if (!cliente) fail('No se encontró el cliente.');
    const pedidos = await q(
      `SELECT p.id_pedido, p.fecha_pedido, p.fecha_entrega, p.estado, p.total,
              COALESCE((SELECT SUM(pg.monto) FROM pagos pg WHERE pg.id_pedido=p.id_pedido),0) pagado
       FROM pedidos p WHERE p.id_cliente=? ORDER BY p.fecha_pedido DESC, p.id_pedido DESC`,
      [id]);
    return { cliente, pedidos };
  },

  'ped:list': ({ estado = '' }) => q(
    `SELECT p.id_pedido, p.fecha_entrega, p.estado, p.total, c.nombre cliente,
            (SELECT COALESCE(SUM(monto),0) FROM pagos WHERE id_pedido = p.id_pedido) pagado
     FROM pedidos p JOIN clientes c USING (id_cliente)
     WHERE ? = '' OR p.estado = ? ORDER BY p.id_pedido DESC LIMIT 200`, [estado, estado]),

  'ped:detail': async ({ id }) => {
    const [pedido] = await q(
      `SELECT p.*, c.nombre cliente, c.telefono telefono_cliente,
              COALESCE((SELECT SUM(pg.monto) FROM pagos pg WHERE pg.id_pedido=p.id_pedido),0) pagado
       FROM pedidos p JOIN clientes c USING (id_cliente) WHERE p.id_pedido=?`,
      [id]);
    if (!pedido) fail('No se encontró el pedido.');
    const [items, pagos] = await Promise.all([
      q(`SELECT d.id_detalle, d.id_producto, pr.nombre producto, pr.sku,
                d.cantidad, d.precio_unitario, d.subtotal
         FROM detalle_pedido d JOIN productos pr USING (id_producto)
         WHERE d.id_pedido=? ORDER BY d.id_detalle`, [id]),
      q('SELECT id_pago, monto, metodo, fecha FROM pagos WHERE id_pedido=? ORDER BY fecha, id_pago', [id]),
    ]);
    return { pedido, items, pagos };
  },

  'ped:pay': ({ id, monto, metodo = 'efectivo' }) => tx(async (c) => {
    const [[pedido]] = await c.query('SELECT total, estado FROM pedidos WHERE id_pedido=? FOR UPDATE', [id]);
    if (!pedido) fail('No se encontró el pedido.');
    if (pedido.estado === 'cancelado') fail('No se pueden registrar abonos a un pedido cancelado.');
    const amount = Number(monto);
    const amountCents = Math.round(amount * 100);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - amountCents) > 1e-7) fail('El abono debe ser mayor a 0 y tener máximo dos decimales.');
    if (!METODOS_PAGO.includes(metodo)) fail('El método de pago no es válido.');
    const [[{ pagado }]] = await c.query('SELECT COALESCE(SUM(monto),0) pagado FROM pagos WHERE id_pedido=?', [id]);
    const saldoCents = Math.round(pedido.total * 100) - Math.round(Number(pagado) * 100);
    if (amountCents > saldoCents) fail('El abono no puede superar el saldo pendiente.');
    const [result] = await c.query('INSERT INTO pagos (id_pedido, monto, metodo) VALUES (?,?,?)', [id, amountCents / 100, metodo]);
    return result.insertId;
  }),

  'rep:summary': async ({ desde, hasta }) => {
    const range = dateRange({ desde, hasta });
    const pedidos = await q(
      `SELECT COUNT(*) pedidos, COALESCE(SUM(CASE WHEN estado <> 'cancelado' THEN total ELSE 0 END),0) ventas
       FROM pedidos WHERE fecha_pedido >= ? AND fecha_pedido < DATE_ADD(?, INTERVAL 1 DAY)`,
      range);
    const pagos = await q(
      `SELECT COALESCE(SUM(monto),0) recaudado
       FROM pagos WHERE fecha >= ? AND fecha < DATE_ADD(?, INTERVAL 1 DAY)`,
      range);
    const estados = await q(
      `SELECT estado, COUNT(*) cantidad FROM pedidos
       WHERE fecha_pedido >= ? AND fecha_pedido < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY estado ORDER BY estado`, range);
    const productos = await q(
      `SELECT pr.id_producto, pr.nombre, SUM(d.cantidad) unidades,
              SUM(d.subtotal) ventas
       FROM detalle_pedido d
       JOIN pedidos p USING (id_pedido)
       JOIN productos pr USING (id_producto)
       WHERE p.estado <> 'cancelado' AND p.fecha_pedido >= ? AND p.fecha_pedido < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY pr.id_producto, pr.nombre
       ORDER BY unidades DESC, ventas DESC LIMIT 10`, range);
    const stockBajo = await q(
      `SELECT id_producto, sku, nombre, stock_actual, stock_minimo
       FROM productos WHERE activo=1 AND stock_actual <= stock_minimo
       ORDER BY (stock_minimo - stock_actual) DESC, nombre`);
    return { pedidos: pedidos[0], pagos: pagos[0], estados, productos, stockBajo };
  },

  // Todo en una transacción: o se guarda el pedido completo o no se guarda nada
  'ped:create': ({ id_cliente, fecha_entrega, direccion_entrega, dedicatoria, notas, items, anticipo = 0, metodo = 'efectivo' }) => tx(async (c) => {
    if (!id_cliente) fail('Elige un cliente.');
    if (!items?.length) fail('Agrega al menos un producto.');
    if (!METODOS_PAGO.includes(metodo)) fail('El método de pago no es válido.');
    const cantidades = new Map();
    let totalCents = 0;
    const lineas = [];
    for (const i of items) {
      const idProducto = Number(i.id_producto);
      const cantidad = Number(i.cantidad);
      const precio = Number(i.precio_unitario);
      if (!Number.isSafeInteger(idProducto) || idProducto <= 0) fail('Uno de los productos seleccionados no es válido.');
      if (!Number.isInteger(cantidad) || cantidad <= 0) fail('La cantidad de cada producto debe ser un entero mayor a 0.');
      const precioCents = Math.round(precio * 100);
      if (!Number.isFinite(precio) || precio < 0 || precioCents > 999999999999 || Math.abs(precio * 100 - precioCents) > 1e-7) fail('El precio debe ser válido y tener máximo dos decimales.');
      cantidades.set(idProducto, (cantidades.get(idProducto) || 0) + cantidad);
      totalCents += cantidad * precioCents;
      lineas.push({ ...i, id_producto: idProducto, cantidad, precio_unitario: precioCents / 100 });
    }
    const total = totalCents / 100;
    if (!Number.isSafeInteger(totalCents) || totalCents > 999999999999) fail('El total del pedido supera el límite permitido.');
    const ids = [...cantidades.keys()];
    const placeholders = ids.map(() => '?').join(',');
    const [productos] = await c.query(
      `SELECT id_producto, nombre, stock_actual FROM productos WHERE id_producto IN (${placeholders}) ORDER BY id_producto FOR UPDATE`,
      ids);
    const disponibles = new Map(productos.map((p) => [p.id_producto, p]));
    for (const [id, cantidad] of cantidades) {
      const p = disponibles.get(id);
      if (!p) fail('Uno de los productos seleccionados ya no existe.');
      if (p.stock_actual < cantidad) fail(`Stock insuficiente de "${p.nombre}" (hay ${p.stock_actual}).`);
    }
    const anticipoNum = Number(anticipo);
    const anticipoCents = Math.round(anticipoNum * 100);
    if (!Number.isFinite(anticipoNum) || anticipoNum < 0 || Math.abs(anticipoNum * 100 - anticipoCents) > 1e-7) fail('El anticipo debe ser válido y tener máximo dos decimales.');
    if (anticipoCents > totalCents) fail('El anticipo no puede superar el total.');
    const [r] = await c.query('INSERT INTO pedidos (id_cliente, fecha_entrega, direccion_entrega, dedicatoria, notas) VALUES (?,?,?,?,?)',
      [id_cliente, n(fecha_entrega), n(direccion_entrega), n(dedicatoria), n(notas)]);
    for (const i of lineas) await c.query('INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario) VALUES (?,?,?,?)', [r.insertId, i.id_producto, i.cantidad, i.precio_unitario]);
    if (anticipoCents > 0) await c.query('INSERT INTO pagos (id_pedido, monto, metodo) VALUES (?,?,?)', [r.insertId, anticipoCents / 100, metodo]);
    return r.insertId;
  }),

  'ped:estado': ({ id, estado }) => tx(async (c) => {
    if (!ESTADOS_PEDIDO.includes(estado)) fail('El estado del pedido no es válido.');
    const [[pedido]] = await c.query('SELECT estado FROM pedidos WHERE id_pedido=? FOR UPDATE', [id]);
    if (!pedido) fail('No se encontró el pedido.');
    if (pedido.estado === 'cancelado') fail('Un pedido cancelado no se puede reactivar.');
    await c.query('UPDATE pedidos SET estado=? WHERE id_pedido=?', [estado, id]); // el trigger devuelve el stock si es 'cancelado'
  }),
};

const amable = (e) =>
  e.code === 'ER_DUP_ENTRY' ? 'Ya existe un registro con ese valor (¿SKU o nombre repetido?).'
  : e.code === 'ER_ACCESS_DENIED_ERROR'
    ? `MySQL rechazó las credenciales. ${app.isPackaged
      ? 'La aplicación usa el .env incluido en app.asar al crear el instalador.'
      : `npm run dev usa ${path.join(app.getAppPath(), '.env')}.`
    } Comprueba que DB_PASSWORD coincida con la contraseña actual y que la cuenta tenga acceso desde localhost.`
  : e.code === 'ECONNREFUSED'
    ? 'No se pudo conectar a MySQL. Verifica que el servicio esté activo y que DB_HOST y DB_PORT en el archivo .env sean correctos.'
  : e.code === 'ER_BAD_DB_ERROR'
    ? 'La base de datos configurada no existe. Verifica DB_NAME en el archivo .env y ejecuta el esquema database/tienda_regalos.sql.'
  : e.message;

exports.register = () => {
  for (const [canal, fn] of Object.entries(H)) {
    ipcMain.handle(canal, async (_e, datos) => {
      try { return { ok: true, data: await fn(datos || {}) }; }
      catch (e) { return { ok: false, error: amable(e) }; }
    });
  }
};
