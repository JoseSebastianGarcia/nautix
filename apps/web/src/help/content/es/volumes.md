# Volúmenes: explorar, descargar y subir

Un volumen es donde un contenedor guarda datos que deben sobrevivir a que lo recreen: una base de datos, archivos subidos, certificados. En **Recursos, Volúmenes** el ícono de la carpeta abre los archivos de un volumen.

![Un volumen abierto en el explorador de archivos, con descarga y subida](img:volumes)

## Explorar

Las carpetas se abren con un clic y los archivos de texto muestran su primer megabyte. Nautix monta el volumen en un contenedor auxiliar efímero y sin red, y lo elimina al terminar, así que no queda nada.

## Descargar

- **Descargar esta carpeta** te da la carpeta actual como un archivo `.tar`.
- La flecha al final de cada fila descarga ese archivo o carpeta.
- Dentro de un archivo, **Descargar** te da ese archivo dentro de un `.tar`.

Un `.tar` conserva nombres y permisos. Se abre con las herramientas del sistema (`tar -xf nombre.tar`, o cualquier programa de archivos comprimidos).

## Subir

**Subir archivos** agrega los archivos que elijas a la carpeta que estás mirando. Antes de que pase nada ves la lista, el destino y lo que hay que tener en cuenta:

- Los archivos con el mismo nombre en esa carpeta se **reemplazan**.
- Los archivos se crean con **root** como dueño. Si la app que usa el volumen corre con otro usuario (las bases de datos suelen hacerlo), puede que no pueda leerlos ni modificarlos.
- Si **un contenedor usa el volumen**, cambiar archivos bajo una app en marcha, sobre todo una base de datos, puede corromper sus datos. Detenela antes.
- El límite es 256 MB por subida y nombres de hasta 100 bytes.

No se puede subir al volumen que guarda los datos propios de Nautix: su base de datos y su clave de cifrado no deben sobrescribirse desde la interfaz que depende de ellas.

## Quién puede y qué se registra

Solo los admins. Cada descarga y cada subida deja una entrada en el [registro de auditoría](help:audit) con el volumen y la carpeta, nunca el contenido.
