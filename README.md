# Tienda Regalos (Electron + React + MySQL)

1. En MySQL Workbench ejecuta `database/tienda_regalos.sql`. Crea las tablas si no existen y no elimina los datos de una base existente.
2. Configura un usuario MySQL con permisos sobre `tienda_regalos`, copia `.env.example` a `.env` y completa las credenciales de ese usuario.
3. Ejecuta `npm install`.
4. Ejecuta `npm run dev` para abrir la app en una ventana de escritorio.
5. Ejecuta `npm run dist` para generar el instalador `.exe` (carpeta `dist` o `release`). El empaquetado incluye el `.env` local dentro del archivo interno `app.asar`; no crea un `.env` visible junto al ejecutable. Configura primero el `.env` local con las credenciales correctas.

**Seguridad:** ocultar el archivo dentro de `app.asar` no cifra la contraseña: cualquier persona con acceso al instalador podría extraerla. Usa este instalador solo para uso personal; no lo compartas ni publiques. El `.env` local está excluido de Git.

El usuario MySQL configurado debe poder conectarse desde `localhost` y tener permisos sobre la base `tienda_regalos` (incluido `EXECUTE` para el procedimiento de entradas de inventario).

## Funciones

- **Inventario:** búsqueda por nombre o SKU, categorías, filtros, entradas/ajustes de stock e historial de movimientos.
- **Pedidos:** creación con validación de stock transaccional, estados, detalle de productos, historial de pagos y abonos posteriores.
- **Clientes:** registro y edición de datos, búsqueda e historial de pedidos y compras.
- **Reportes:** resumen por periodo de pedidos, ventas, pagos, productos más vendidos y niveles actuales de stock.

Para respaldar la base de datos, programa `mysqldump -u regalos_app -p tienda_regalos > respaldo.sql`. Los archivos de respaldo `.sql` se excluyen de Git.
