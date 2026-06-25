# Planning Obra — Complejo Acuático La Vall d'Uixó
### Creada por Sicignano Gaetano

Servidor con base de datos compartida y fotos, para que tú y tu compañero veáis
los mismos datos en tiempo real desde vuestros teléfonos.

## Qué incluye

- `server.js` — servidor Node.js (Express + SQLite + subida de fotos)
- `public/index.html` — la app que se abre en el navegador
- `Dockerfile` — para desplegar en EasyPanel con un clic
- `package.json` — dependencias

## Funcionalidades

- Vista diaria del 15 de junio al 31 de agosto de 2026
- Arrastra una tarea a izquierda/derecha para moverla de día
- Toca el círculo de progreso para avanzar 25% cada vez, o abre la tarjeta para
  poner un porcentaje exacto con el deslizador
- **Editar nombre y categoría** de cualquier partida, tocando el nombre dentro
  del panel de detalle
- **Foto de portada**: una imagen fija por partida que identifica visualmente
  la fase de obra — se ve como miniatura en la lista y en grande dentro del
  panel de detalle. Se puede añadir, cambiar o quitar en cualquier momento
- **Fotos de avance**: a diferencia de la portada, puedes añadir varias fotos
  con fecha, para documentar el progreso día a día
- Notas de texto libre por partida
- Fecha límite con aviso visual si se supera sin completar la tarea
- Añadir nuevas partidas o eliminar las existentes
- Exportar un PDF con diagrama de Gantt completo, con barras de progreso,
  fechas límite marcadas y notas en una página final

## Cómo desplegarlo en EasyPanel (tu VPS Hostinger)

### Paso 1 — Subir el código

La forma más simple es subir este proyecto a un repositorio de GitHub (puede ser
privado):

1. Crea un repositorio nuevo en GitHub (ej. `obra-planning`)
2. Sube esta carpeta entera (todos los archivos menos `node_modules` y `data`)
3. Si no sabes usar git, dime y te preparo el repositorio yo mismo — solo necesito
   que crees el repo vacío en GitHub y me pases la URL

### Paso 2 — Crear el servicio en EasyPanel

1. Entra a EasyPanel (botón "Gestionar panel" desde tu hPanel de Hostinger)
2. Crea un nuevo proyecto (o usa uno existente)
3. Añade un nuevo servicio → tipo **App** → fuente **GitHub** (conecta tu cuenta
   si es la primera vez)
4. Selecciona el repositorio `obra-planning`
5. EasyPanel detectará el `Dockerfile` automáticamente
6. En **Puerto**, pon `3000` (es el puerto que usa el servidor)

### Paso 3 — Configurar almacenamiento persistente (IMPORTANTE)

Para que los datos y las fotos no se borren cada vez que se reinicia el
contenedor, en EasyPanel añade dos **volúmenes**:

| Volumen (host) | Ruta dentro del contenedor |
|---|---|
| `obra-data` | `/app/data` |
| `obra-uploads` | `/app/public/uploads` |

Esto se configura en la sección "Volumes" / "Almacenamiento" del servicio en
EasyPanel, antes de desplegar.

### Paso 4 — Desplegar

Pulsa **Deploy**. EasyPanel construirá la imagen Docker y arrancará el servidor.

### Paso 5 — Acceder desde el teléfono

EasyPanel te dará una URL del tipo:
- `http://85.31.237.206:PUERTO` (con el puerto que EasyPanel asigne), o
- puedes configurar un dominio/subdominio si lo prefieres más adelante

Abre esa URL en Chrome desde los dos teléfonos. Ambos veréis los mismos datos,
sincronizados automáticamente cada 4 segundos.

## Notas técnicas

- La base de datos es SQLite, un único archivo en `/app/data/obra.db` —
  fácil de hacer backup copiando ese archivo
- Las fotos se comprimen automáticamente a 1280px de ancho máximo, calidad 72%,
  formato JPEG — para no llenar el disco rápido
- Sin HTTPS (al usar IP directa) — para uso interno entre dos personas no es un
  problema, pero las contraseñas o datos sensibles no deberían pasar por esta app
- Para hacer backup manual: copia los archivos dentro de los volúmenes
  `obra-data` y `obra-uploads` desde el VPS

## Si algo no funciona

- Comprueba los logs del servicio en EasyPanel (botón "Logs")
- Verifica que el puerto 3000 esté expuesto correctamente
- Si las fotos no se suben, revisa que el volumen `/app/public/uploads` esté
  bien montado
