# Plantillas y builds

## Plantillas

La paleta de la topología tiene servicios listos para correr, agrupados por categoría: proxies, gateways de API, bases de datos, caché, mensajería, identidad, almacenamiento, secretos, observabilidad, automatización y DNS. Arrastrá uno a una caja de red, revisá el nombre y el puerto, y desplegá.

Algunas categorías que conviene conocer:

- **Identidad**: Keycloak, Pocket ID y Casdoor.
- **Almacenamiento**: RustFS (compatible con S3), Azurite (Azure Blob) y fake-gcs-server (Google Cloud Storage).
- **Proxies**: además de Traefik, Nginx, Caddy y HAProxy, **Caddy HTTPS (un sitio)** pone un certificado real delante de un servicio: indicá tu dominio y el destino en su comando (`--from vault.example.com --to vaultwarden:80`). Necesita un dominio público apuntando a la máquina y los puertos 80 y 443 abiertos a internet, así que sirve para un VPS, no para una notebook.
- **Secretos**: Vaultwarden (gestor de contraseñas para equipos, compatible con Bitwarden), OpenBao, HashiCorp Vault y Lowkey Vault (Azure Key Vault). OpenBao y Vault tienen una variante con almacenamiento que puede guardar sus datos en un volumen para que sobrevivan a la recreación del contenedor.
- **Mis imágenes**: lo que construiste o descargaste. **Cualquier imagen** despliega una imagen por nombre.

Las plantillas que necesitan una contraseña o una dirección la piden en el diálogo de despliegue. Revisá los valores de entorno antes de desplegar.

## Builds

**Recursos, Builds** construye una imagen en este motor.

![La página de builds con el editor de Dockerfile](img:builds)

1. Escribí un Dockerfile, o presioná **Containerizar mi app** y elegí un punto de partida (Node.js, Python, Go, sitio estático) o usá el asistente para un proyecto .NET o genérico.
2. El panel de **revisiones** marca problemas mientras escribís: imágenes base sin versión fija, ejecución como root, falta de `HEALTHCHECK`. **Corregir** aplica el cambio sugerido cuando lo hay.
3. Agregá archivos de texto pequeños que el Dockerfile pueda `COPY`, o elegí una carpeta de tu computadora como contexto de build. Se respeta un `.dockerignore`.
4. Indicá la etiqueta, una etapa objetivo opcional y los argumentos de build, y presioná **Construir**. La salida se muestra en vivo.

> Los argumentos de build quedan en el historial de la imagen. Nunca pongas secretos ahí.

La imagen construida aparece en **Imágenes** y en la paleta, en **Mis imágenes**.
