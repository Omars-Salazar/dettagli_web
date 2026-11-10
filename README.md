# Tienda Regalos (Electron + React + MySQL)

1. En Workbench ejecuta `database/tienda_regalos.sql` y luego `database/crear_usuario.sql` (cambia la clave).
2. Copia `.env.example` a `.env` y pon la misma clave.
3. `npm install`
4. `npm run dev` abre la app en una ventana de escritorio.
5. `npm run dist` genera el instalador .exe (carpeta `dist` o `release`). El `.env` queda junto al .exe instalado; edítalo allí si cambias la clave.

Respaldo: programa `mysqldump -u regalos_app -p tienda_regalos > respaldo.sql` en el Programador de tareas de Windows.
