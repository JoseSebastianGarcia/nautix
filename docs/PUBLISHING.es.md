# Publicar la imagen de Nautix en Docker Hub (paso a paso)

Hay dos caminos. **A** es el recomendado: GitHub Actions construye y publica solo cuando creás un tag.
**B** es manual, desde tu máquina, útil para la primera vez o si algo falla en A.

Antes de empezar necesitás: una cuenta en <https://hub.docker.com>, Docker instalado en tu máquina y permiso de
escritura en el repositorio de GitHub.

---

## 0. Revisar que todo está listo

```bash
git checkout release/0.4.0        # o la rama de la versión que vas a publicar
git pull
pnpm install
pnpm lint && pnpm test            # deben pasar
```

Comprobá también `LICENSE` (Apache-2.0), `NOTICE` y el número de versión que querés publicar.

## 1. Crear el repositorio en Docker Hub (una sola vez)

1. Entrá a <https://hub.docker.com> → **Repositories** → **Create repository**.
2. Nombre: `nautix`. Visibilidad: **Public**.
3. En *Description* poné una línea: `Self-hosted web client to manage Docker: visual networks, Compose and Swarm.`
4. Quedará como `TU_USUARIO/nautix` (por ejemplo `patterna/nautix`; si querés un nombre de organización, creá la
   organización primero en Docker Hub y creá el repositorio dentro de ella).

## 2. Crear un token de acceso (una sola vez)

1. Docker Hub → tu avatar → **Account settings** → **Personal access tokens** → **Generate new token**.
2. Descripción: `nautix-release`. Permisos: **Read & Write**. Copiá el token (solo se muestra una vez).

---

## Camino A: automático con GitHub Actions (recomendado)

### A1. Guardar los secretos en GitHub (una sola vez)

En el repositorio de GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

| Nombre | Valor |
|---|---|
| `DOCKERHUB_USERNAME` | tu usuario (o el de la organización dueña del repositorio) |
| `DOCKERHUB_TOKEN` | el token del paso 2 |

### A2. Publicar una versión

Desde tu máquina, sobre la rama de release ya subida:

```bash
git checkout release/0.4.0 && git pull
git tag v0.4.0
git push origin v0.4.0
```

El tag dispara el workflow `release` (pestaña **Actions** de GitHub). Construye la imagen para **amd64 y arm64**, con SBOM
y *provenance*, y publica tres etiquetas: `0.4.0`, `0.4` y `latest`.

También podés lanzarlo a mano: **Actions → release → Run workflow** y escribir la versión (por ejemplo `0.4.0`).

### A3. Verificar

```bash
docker pull TU_USUARIO/nautix:0.4.0
docker buildx imagetools inspect TU_USUARIO/nautix:0.4.0   # debe listar linux/amd64 y linux/arm64
```

---

## Camino B: manual desde tu máquina

### B1. Iniciar sesión

```bash
docker login -u TU_USUARIO         # pegá el token como contraseña
```

### B2. Preparar un builder multiarquitectura (una sola vez)

```bash
docker buildx create --name nautix-builder --use
docker run --privileged --rm tonistiigi/binfmt --install all   # emulación para construir arm64 en una máquina amd64
```

### B3. Probar la construcción local (opcional pero recomendado)

```bash
docker build -t nautix:test .
DOCKER_GID=$(stat -c %g /var/run/docker.sock) docker run --rm -p 127.0.0.1:3737:3737 \
  -v /var/run/docker.sock:/var/run/docker.sock -v nautix-test:/data \
  --group-add "$(stat -c %g /var/run/docker.sock)" -e NAUTIX_TLS=auto nautix:test
```

Abrí <https://localhost:3737>, comprobá que carga y cortá con `Ctrl+C`.

### B4. Construir y publicar

```bash
VERSION=0.4.0
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --provenance=true --sbom=true \
  -t TU_USUARIO/nautix:$VERSION \
  -t TU_USUARIO/nautix:${VERSION%.*} \
  -t TU_USUARIO/nautix:latest \
  --push .
```

La primera vez tarda (compila el frontend y el backend, y emula arm64).

### B5. Verificar

```bash
docker buildx imagetools inspect TU_USUARIO/nautix:$VERSION
```

---

## 3. Después de publicar

1. **Probá la imagen como la usaría un usuario nuevo**, en otra carpeta y sin el código:

   ```bash
   export NAUTIX_IMAGE=TU_USUARIO/nautix
   export DOCKER_GID=$(stat -c %g /var/run/docker.sock)
   docker compose -f compose.hub.yaml up -d
   docker compose -f compose.hub.yaml logs nautix        # copiá el token de configuración inicial
   ```

2. **Descripción larga en Docker Hub**: editá el repositorio → *Description* → pegá el contenido de `README.md`
   (o un resumen con el `docker run` de abajo y un enlace al repositorio).
3. **Crear el release en GitHub**: *Releases → Draft a new release* → elegí el tag `v0.4.0` → *Generate release notes*.
4. **Actualizar la landing** con el comando de instalación y la versión.

## 4. Instalar sin Compose (para la documentación)

```bash
docker run -d --name nautix --restart unless-stopped \
  -p 127.0.0.1:3737:3737 \
  -v /var/run/docker.sock:/var/run/docker.sock -v nautix-data:/data \
  --group-add "$(stat -c %g /var/run/docker.sock)" \
  --cap-drop ALL --security-opt no-new-privileges:true --read-only --tmpfs /tmp \
  -e NAUTIX_TLS=auto \
  TU_USUARIO/nautix:latest
```

## 5. Actualizar una instalación existente

```bash
docker compose -f compose.hub.yaml pull && docker compose -f compose.hub.yaml up -d
```

Antes, **Ajustes → Copia de seguridad** (incluye la clave de cifrado).

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `denied: requested access to the resource is denied` | Usuario o token incorrectos, o el repositorio no existe o es de otra organización. Repetí `docker login`. |
| El workflow falla en *login* | Los secretos `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` faltan o el token no tiene *Read & Write*. |
| `exec format error` al correr en otra máquina | Imagen construida solo para una arquitectura. Usá `--platform linux/amd64,linux/arm64`. |
| Falla el build detrás de un proxy corporativo | Poné los certificados `.crt` en `certs/` (ver `certs/README.md`). |
| `permission denied` al abrir el socket | `DOCKER_GID` no coincide con el grupo del socket: `stat -c %g /var/run/docker.sock`. |
| No puedo subir el tag desde el sandbox o una máquina sin permisos | Los tags se crean y suben desde tu máquina con acceso al repositorio. |

## Lista de control de cada versión

- [ ] `pnpm lint` y `pnpm test` en verde.
- [ ] Versión actualizada en `package.json` y en las notas de cambios.
- [ ] Rama `release/X.Y.Z` al día con `main`.
- [ ] Tag `vX.Y.Z` subido y workflow verde.
- [ ] Imagen probada con `compose.hub.yaml` en una máquina limpia.
- [ ] Release de GitHub y landing actualizados.
