# Problemas frecuentes

## Un cambio se revirtió

El contenedor nuevo no arrancó o no quedó sano. El mensaje muestra el motivo y las últimas líneas de log. Corregí la causa (un valor incorrecto, una dependencia faltante, un puerto ya en uso) y probá de nuevo. Mientras tanto el contenedor anterior sigue corriendo. Mirá [Aplicar con seguridad](help:safe-apply).

## Un vínculo dice que no se pueden vincular

Verificá que el servicio esté en una red que creaste. El bridge por defecto no resuelve nombres.

## "could not translate host name"

La app y el servicio no están en una red definida por el usuario en común. Creá un [vínculo](help:bindings) o unile la app a la red del servicio.

## Un puerto no es accesible desde otra máquina

Los puertos publicados están enlazados a `127.0.0.1` por defecto. Cambiá la exposición a una dirección o a todos desde la página del contenedor y después revisá cualquier regla de [guarda](help:guards) sobre ese puerto.

## No se puede crear una red overlay

- **"Una red overlay necesita un swarm"**: este motor no está en un swarm. Creá uno primero en **Recursos, Swarm**.
- **"Este motor es un worker de swarm"**: solo un manager puede crear redes overlay. Conectá Nautix a un manager.
- **"El swarm está bloqueado"**: desbloquealo en la pestaña Swarm.

Mirá [Vista de cluster y redes overlay](help:cluster).

## El puerto ya está asignado

Otro contenedor o programa usa ese puerto del host. Elegí otro, o detené el otro.

## Mis nombres DNS no se resuelven

- La máquina que pregunta debe usar tu contenedor DNS como resolvedor.
- El puerto 53 debe estar publicado en una dirección que esa máquina alcance.
- Usá **Preguntarle al servidor** en **Recursos, DNS** para probar el registro directamente.

## Windows y WSL

- La distribución WSL2 se detiene cuando no hay ninguna sesión de `wsl.exe` abierta, y Docker con ella. Una entrada de mantenimiento al inicio lo evita.
- Sin permisos de administrador no podés abrir puertos en el firewall de Windows, así que otras máquinas de tu red no llegan a WSL. La red en modo mirrored requiere Windows 11 22H2 o posterior.
- En el modo NAT por defecto, los puertos UDP (como DNS) no se reenvían a `localhost`.
- Un VPS o un servidor Linux es el lugar más simple para Docker si la máquina corporativa está restringida.

## Me bloqueé con una regla de guarda

Las reglas aplicadas en prueba se revierten solas a los 60 segundos. En el host: `docker exec nautix-guard node dist/guard-helper.js --panic` quita todas las reglas de firewall de Nautix.

## Olvidé la contraseña

Pedile a un admin que la restablezca en **Ajustes, Usuarios**.
