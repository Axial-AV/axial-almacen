# Axial AV · Almacén

App instalable (PWA) para la salida, entrada y consulta del material de Axial AV.
Lee y escribe en la hoja de Google «Inventario_Axial_AV» a través de una API de Apps Script (privada, con código de acceso).

- index.html: estructura y estilos
- app.js: datos, reglas y cola de sincronización
- ui.js: pantallas
- sw.js: guarda la app en el móvil para que funcione sin cobertura (sube el número de CACHE al publicar cambios)
- html5-qrcode.min.js: lector de QR (html5-qrcode 2.3.8, licencia Apache 2.0)
