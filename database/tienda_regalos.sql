-- Esquema de la tienda. Este archivo no elimina ni reinicia bases de datos.
CREATE DATABASE IF NOT EXISTS tienda_regalos
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE tienda_regalos;

CREATE TABLE IF NOT EXISTS categorias (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  descripcion VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  telefono VARCHAR(30),
  email VARCHAR(120),
  notas VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS clientes (
  id_cliente INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  telefono VARCHAR(30),
  email VARCHAR(120),
  direccion VARCHAR(255),
  ciudad VARCHAR(80),
  fecha_cumpleanos DATE,
  notas VARCHAR(255),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cliente_nombre (nombre),
  INDEX idx_cliente_tel (telefono)
);

CREATE TABLE IF NOT EXISTS productos (
  id_producto INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(40) UNIQUE,
  nombre VARCHAR(150) NOT NULL,
  descripcion VARCHAR(255),
  id_categoria INT,
  id_proveedor INT,
  costo DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_venta DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_actual INT NOT NULL DEFAULT 0,
  stock_minimo INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_categoria) REFERENCES categorias(id_categoria),
  FOREIGN KEY (id_proveedor) REFERENCES proveedores(id_proveedor),
  INDEX idx_producto_nombre (nombre)
);

CREATE TABLE IF NOT EXISTS pedidos (
  id_pedido INT AUTO_INCREMENT PRIMARY KEY,
  id_cliente INT NOT NULL,
  fecha_pedido DATETIME DEFAULT CURRENT_TIMESTAMP,
  fecha_entrega DATE,
  estado ENUM('pendiente','en_preparacion','listo','entregado','cancelado') NOT NULL DEFAULT 'pendiente',
  direccion_entrega VARCHAR(255),
  dedicatoria VARCHAR(255),
  notas VARCHAR(255),
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
  INDEX idx_pedido_estado (estado),
  INDEX idx_pedido_entrega (fecha_entrega),
  INDEX idx_pedido_fecha (fecha_pedido)
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
  id_producto INT NOT NULL,
  tipo ENUM('entrada','salida','ajuste') NOT NULL,
  cantidad INT NOT NULL,
  motivo VARCHAR(150),
  id_pedido INT NULL,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
  INDEX idx_mov_producto (id_producto, fecha)
);

CREATE TABLE IF NOT EXISTS detalle_pedido (
  id_detalle INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido INT NOT NULL,
  id_producto INT NOT NULL,
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
  FOREIGN KEY (id_producto) REFERENCES productos(id_producto)
);

CREATE TABLE IF NOT EXISTS pagos (
  id_pago INT AUTO_INCREMENT PRIMARY KEY,
  id_pedido INT NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  metodo ENUM('efectivo','transferencia','tarjeta','otro') NOT NULL DEFAULT 'efectivo',
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_pedido) REFERENCES pedidos(id_pedido) ON DELETE CASCADE,
  INDEX idx_pago_fecha (fecha)
);

DELIMITER $$

DROP TRIGGER IF EXISTS trg_detalle_ai$$
CREATE TRIGGER trg_detalle_ai AFTER INSERT ON detalle_pedido
FOR EACH ROW
BEGIN
  UPDATE productos SET stock_actual = stock_actual - NEW.cantidad
   WHERE id_producto = NEW.id_producto;

  INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, motivo, id_pedido)
  VALUES (NEW.id_producto, 'salida', NEW.cantidad, 'Venta - pedido', NEW.id_pedido);

  UPDATE pedidos
     SET total = (SELECT COALESCE(SUM(subtotal),0) FROM detalle_pedido WHERE id_pedido = NEW.id_pedido)
   WHERE id_pedido = NEW.id_pedido;
END$$

DROP TRIGGER IF EXISTS trg_pedido_cancelado$$
CREATE TRIGGER trg_pedido_cancelado AFTER UPDATE ON pedidos
FOR EACH ROW
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    UPDATE productos p
      JOIN (
        SELECT id_producto, SUM(cantidad) cantidad
          FROM detalle_pedido
         WHERE id_pedido = NEW.id_pedido
         GROUP BY id_producto
      ) d ON d.id_producto = p.id_producto
       SET p.stock_actual = p.stock_actual + d.cantidad;

    INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, motivo, id_pedido)
    SELECT id_producto, 'entrada', cantidad, 'Pedido cancelado', id_pedido
      FROM detalle_pedido WHERE id_pedido = NEW.id_pedido;
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_entrada_stock$$
CREATE PROCEDURE sp_entrada_stock(IN p_producto INT, IN p_cantidad INT, IN p_motivo VARCHAR(150))
BEGIN
  UPDATE productos SET stock_actual = stock_actual + p_cantidad WHERE id_producto = p_producto;
  INSERT INTO movimientos_inventario (id_producto, tipo, cantidad, motivo)
  VALUES (p_producto, 'entrada', p_cantidad, p_motivo);
END$$

DELIMITER ;

CREATE OR REPLACE VIEW v_stock_bajo AS
SELECT id_producto, sku, nombre, stock_actual, stock_minimo
  FROM productos
 WHERE activo = 1 AND stock_actual <= stock_minimo;

CREATE OR REPLACE VIEW v_saldo_pedidos AS
SELECT p.id_pedido, c.nombre AS cliente, p.fecha_entrega, p.estado, p.total,
       COALESCE(SUM(pg.monto),0) AS pagado,
       p.total - COALESCE(SUM(pg.monto),0) AS saldo
  FROM pedidos p
  JOIN clientes c ON c.id_cliente = p.id_cliente
  LEFT JOIN pagos pg ON pg.id_pedido = p.id_pedido
 WHERE p.estado <> 'cancelado'
 GROUP BY p.id_pedido, c.nombre, p.fecha_entrega, p.estado, p.total;

CREATE OR REPLACE VIEW v_historial_cliente AS
SELECT c.id_cliente, c.nombre, COUNT(p.id_pedido) AS num_pedidos,
       COALESCE(SUM(p.total),0) AS total_comprado,
       MAX(p.fecha_pedido) AS ultima_compra
  FROM clientes c
  LEFT JOIN pedidos p ON p.id_cliente = c.id_cliente AND p.estado <> 'cancelado'
 GROUP BY c.id_cliente, c.nombre;
