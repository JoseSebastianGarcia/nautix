# DNS

Dale a tus propios nombres (como `app.home.lab`) una dirección IP. Los contenedores y las máquinas que usen tu contenedor DNS como resolvedor los encuentran; todos los demás nombres se reenvían al DNS de salida.

![Registros DNS de un dominio local](img:dns)

## Configuración

1. Desplegá **dnsmasq** o **CoreDNS** desde la paleta (Topología, categoría DNS). Aparece en **Recursos, DNS**.
2. Agregá registros: un dominio y una dirección IP, o elegí un contenedor y usá su IP. Un registro también cubre sus subdominios (`db.app.lab` recibe la misma dirección que `app.lab`).
3. **Guardar y aplicar**. Nautix escribe los registros en el contenedor DNS y lo reinicia o recarga (dnsmasq se reinicia, cerca de un segundo sin DNS).
4. **Preguntarle al servidor** prueba un nombre contra él.

## Cómo usarlo

- **Contenedores** en la red del contenedor DNS pueden usarlo como resolvedor.
- **Otras máquinas** necesitan que su configuración de red (o tu router) apunte a la máquina que corre el contenedor DNS, con su puerto 53 publicado en una dirección que ellas alcancen. Un puerto publicado en `127.0.0.1` responde solo a esta máquina.

## Quién puede usar tus nombres

Solo quien use tu servidor DNS como resolvedor. Un contenedor DNS no hace que los nombres sean visibles en internet. Publicá el puerto 53 solo donde lo necesitás: un DNS abierto en una dirección pública se puede abusar para ataques de amplificación. Mirá [Guardas de puertos](help:guards).

## Los registros siguen valiendo

Un registro que apunta a un contenedor lo sigue por nombre, no por IP, así que sigue funcionando después de recrear el contenedor.
