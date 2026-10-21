# Primeros pasos

Nautix maneja desde el navegador el motor Docker de esta máquina: contenedores, imágenes, volúmenes, redes, proyectos Compose y builds. Todo lo que hacés es una acción de Docker, y cada una puede mostrarte el comando `docker` equivalente.

## Dónde está cada cosa

| Menú | Para qué sirve |
|---|---|
| Topología | La máquina como un diagrama: las redes son cajas y los contenedores van adentro |
| Recursos | Listas y pestañas de contenedores, imágenes, volúmenes, redes, builds, gateways, DNS, guardas y Swarm |
| Compose | Proyectos Compose, con editor visual y el YAML al lado |
| Sistema | Datos del motor, uso de disco, asistente de limpieza, eventos e inventario de exposición |

Los íconos de arriba a la derecha cambian el tema y el idioma, cambian tu contraseña, abren Ajustes (admins) y esta ayuda.

## Tu primer contenedor

1. Abrí **Topología**.
2. Arrastrá un elemento de la paleta (una base de datos, un proxy, cualquier imagen) a una caja de red.
3. Completá el nombre y el puerto, y desplegá.

Los puertos publicados escuchan solo en `127.0.0.1`, así que nada es accesible desde afuera de esta máquina hasta que lo decidas (ver [Guardas de puertos](help:guards)).

> Las acciones destructivas (eliminar, limpiar) siempre listan qué se va a afectar antes de pedirte confirmación.

## Roles

Los admins pueden cambiar cosas. Los viewers pueden mirar pero no cambiar nada, no pueden abrir terminales y no ven los valores de las variables de entorno.

## Siguiente

- [Topología y zonas](help:topology)
- [Vínculos: conectar una app con un servicio](help:bindings)
- [Aplicar con seguridad y rollback](help:safe-apply)
- [Problemas frecuentes](help:troubleshooting)
