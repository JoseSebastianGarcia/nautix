/**
 * "Recipes": a few questions in, a good multi-stage Dockerfile (and the files that go with it) out.
 * They are pure functions so the same code runs in the browser preview and in the tests, and every
 * generated file must pass the built-in lint.
 */

export type FieldKind = "text" | "number" | "boolean" | "select" | "lines";

export interface RecipeField {
  id: string;
  kind: FieldKind;
  default: string | number | boolean;
  /** For `select`. */
  options?: readonly string[];
  /** Show only when another field has this value. */
  when?: { field: string; is: string | boolean };
}

export type Params = Record<string, string | number | boolean>;

export interface Recipe {
  id: RecipeId;
  group: "dotnet" | "other";
  /** Icon hint for the UI (lucide name). */
  fields: readonly RecipeField[];
  generate(params: Params): GeneratedProject;
}

export interface RecipeNote {
  key: "context" | "port" | "health" | "noTools" | "noShell" | "blazorClient";
  params?: Record<string, string | number>;
}

export interface GeneratedProject {
  dockerfile: string;
  /** Extra files for the build context (a .dockerignore, an nginx.conf…). */
  files: { path: string; content: string }[];
  /** Reminders about what the generated file assumes: i18n keys under `builds.wizard.notes`. */
  notes: RecipeNote[];
}

export type RecipeId =
  | "dotnet-web"
  | "dotnet-worker"
  | "dotnet-blazor"
  | "node"
  | "python"
  | "go"
  | "static";

const str = (p: Params, k: string, fallback = ""): string => {
  const v = p[k];
  return typeof v === "string" ? v.trim() : v === undefined ? fallback : String(v);
};
const num = (p: Params, k: string, fallback: number): number => {
  const n = Number(p[k]);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : fallback;
};
const bool = (p: Params, k: string, fallback: boolean): boolean =>
  typeof p[k] === "boolean" ? (p[k] as boolean) : fallback;
const lines = (p: Params, k: string): string[] =>
  str(p, k)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const DOTNET_VERSIONS = ["10.0", "9.0", "8.0"] as const;
const FLAVORS = ["alpine", "debian", "chiseled"] as const;

/** Tag suffix of the chiseled (distroless-style, no shell) images: .NET 8 is built on Ubuntu 22.04, later ones on 24.04. */
const chiseledSuffix = (version: string): string =>
  version.startsWith("8.") ? "jammy-chiseled" : "noble-chiseled";

const dotnetImage = (
  kind: "sdk" | "aspnet" | "runtime",
  version: string,
  flavor: string,
): string => {
  if (kind === "sdk") return `mcr.microsoft.com/dotnet/sdk:${version}`;
  const suffix =
    flavor === "alpine" ? "-alpine" : flavor === "chiseled" ? `-${chiseledSuffix(version)}` : "";
  return `mcr.microsoft.com/dotnet/${kind}:${version}${suffix}`;
};

/** `src/Shop.Api/Shop.Api.csproj` → `Shop.Api`. */
export const assemblyOf = (project: string): string =>
  (project.split("/").pop() ?? "").replace(/\.(cs|fs|vb)proj$/i, "") || "App";

const dirOf = (path: string): string => path.split("/").slice(0, -1).join("/");

export const dockerignore = (extra: string[] = []): string =>
  [
    "# Keeps the build context small and out of secrets",
    "**/bin/",
    "**/obj/",
    "**/.vs/",
    "**/.vscode/",
    "**/.idea/",
    "**/node_modules/",
    "**/*.user",
    ".git/",
    ".gitignore",
    "**/.env",
    "**/.env.*",
    "Dockerfile*",
    "docker-compose*",
    "**/*.md",
    ...extra,
    "",
  ].join("\n");

const COMMENT_RESTORE =
  "# Copy the project files first: the restore layer is cached until the dependencies change";

const dotnetFields = (): RecipeField[] => [
  { id: "project", kind: "text", default: "src/MyApp/MyApp.csproj" },
  { id: "assembly", kind: "text", default: "" },
  { id: "version", kind: "select", default: "10.0", options: DOTNET_VERSIONS },
  { id: "flavor", kind: "select", default: "alpine", options: FLAVORS },
  { id: "extraProjects", kind: "lines", default: "" },
];

/** COPY of every project file, then restore: the part that makes rebuilds fast. */
const restoreBlock = (main: string, extra: string[]): string[] => {
  const projects = [main, ...extra.filter((p) => p !== main)];
  return [
    COMMENT_RESTORE,
    ...projects.map((p) => `COPY ["${p}", "${dirOf(p) ? `${dirOf(p)}/` : "./"}"]`),
    `RUN dotnet restore "${main}"`,
    "COPY . .",
  ];
};

const dotnetRecipe = (kind: "web" | "worker"): Recipe => ({
  id: kind === "web" ? "dotnet-web" : "dotnet-worker",
  group: "dotnet",
  fields: [
    ...dotnetFields(),
    ...(kind === "web"
      ? ([
          { id: "port", kind: "number", default: 8080 },
          {
            id: "healthPath",
            kind: "text",
            default: "/health",
            when: { field: "flavor", is: "alpine" },
          },
        ] as RecipeField[])
      : []),
    { id: "nonRoot", kind: "boolean", default: true },
  ],
  generate(p) {
    const project = str(p, "project", "src/MyApp/MyApp.csproj");
    const assembly = str(p, "assembly") || assemblyOf(project);
    const version = str(p, "version", "10.0");
    const flavor = str(p, "flavor", "alpine");
    const port = num(p, "port", 8080);
    const healthPath = flavor === "alpine" ? str(p, "healthPath") : "";
    const nonRoot = bool(p, "nonRoot", true);
    const web = kind === "web";
    const build = [
      `FROM ${dotnetImage("sdk", version, flavor)} AS build`,
      "WORKDIR /src",
      ...restoreBlock(project, lines(p, "extraProjects")),
      "# Framework-dependent publish: smallest image, the runtime comes from the base image",
      `RUN dotnet publish "${project}" -c Release -o /app/publish --no-restore /p:UseAppHost=false`,
    ];
    const final = [
      `FROM ${dotnetImage(web ? "aspnet" : "runtime", version, flavor)} AS final`,
      "WORKDIR /app",
      ...(web ? [`ENV ASPNETCORE_HTTP_PORTS=${port}`] : []),
      ...(flavor === "alpine"
        ? [
            "# Alpine has no ICU libraries: use invariant globalization",
            "ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true",
          ]
        : []),
      ...(web ? [`EXPOSE ${port}`] : []),
      "COPY --from=build /app/publish .",
      ...(nonRoot
        ? ["# The .NET images ship a non-root user and expose its id as $APP_UID", "USER $APP_UID"]
        : []),
      ...(web && healthPath
        ? [
            `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${port}${healthPath.startsWith("/") ? healthPath : `/${healthPath}`} || exit 1`,
          ]
        : []),
      `ENTRYPOINT ["dotnet", "${assembly}.dll"]`,
    ];
    const notes: RecipeNote[] = [
      { key: "context" },
      ...(web ? [{ key: "port" as const, params: { port } }] : []),
      ...(web && healthPath ? [{ key: "health" as const, params: { path: healthPath } }] : []),
      ...(web && flavor !== "alpine" ? [{ key: "noTools" as const }] : []),
      ...(flavor === "chiseled" ? [{ key: "noShell" as const }] : []),
    ];
    return {
      dockerfile: `${[...build, "", ...final].join("\n")}\n`,
      files: [{ path: ".dockerignore", content: dockerignore() }],
      notes,
    };
  },
});

const NGINX_SPA = `server {
    listen 8080;
    root /usr/share/nginx/html;
    index index.html;

    # Blazor WebAssembly: unknown paths are client-side routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Framework files never change for a given build: let browsers keep them
    location /_framework/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
`;

const blazorRecipe: Recipe = {
  id: "dotnet-blazor",
  group: "dotnet",
  fields: [
    { id: "project", kind: "text", default: "src/MyBlazor/MyBlazor.csproj" },
    { id: "version", kind: "select", default: "10.0", options: DOTNET_VERSIONS },
    { id: "extraProjects", kind: "lines", default: "" },
  ],
  generate(p) {
    const project = str(p, "project", "src/MyBlazor/MyBlazor.csproj");
    const version = str(p, "version", "10.0");
    const dockerfile = [
      `FROM ${dotnetImage("sdk", version, "debian")} AS build`,
      "WORKDIR /src",
      ...restoreBlock(project, lines(p, "extraProjects")),
      `RUN dotnet publish "${project}" -c Release -o /app/publish --no-restore`,
      "",
      "# The result is static files: serve them with an unprivileged nginx",
      "FROM nginxinc/nginx-unprivileged:1.27-alpine AS final",
      "COPY nginx.conf /etc/nginx/conf.d/default.conf",
      "COPY --from=build /app/publish/wwwroot /usr/share/nginx/html",
      "EXPOSE 8080",
      "USER nginx",
      "HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ || exit 1",
      'CMD ["nginx", "-g", "daemon off;"]',
    ];
    return {
      dockerfile: `${dockerfile.join("\n")}\n`,
      files: [
        { path: ".dockerignore", content: dockerignore() },
        { path: "nginx.conf", content: NGINX_SPA },
      ],
      notes: [{ key: "blazorClient" }],
    };
  },
};

const nodeRecipe: Recipe = {
  id: "node",
  group: "other",
  fields: [
    { id: "version", kind: "select", default: "22", options: ["22", "20", "24"] },
    { id: "port", kind: "number", default: 3000 },
    { id: "entry", kind: "text", default: "server.js" },
    { id: "nonRoot", kind: "boolean", default: true },
  ],
  generate(p) {
    const version = str(p, "version", "22");
    const port = num(p, "port", 3000);
    const entry = str(p, "entry", "server.js");
    const lines = [
      `FROM node:${version}-alpine AS deps`,
      "WORKDIR /app",
      "# Dependency files first so `npm ci` is cached until they change",
      "COPY package*.json ./",
      "RUN npm ci --omit=dev",
      "",
      `FROM node:${version}-alpine AS final`,
      "WORKDIR /app",
      "ENV NODE_ENV=production",
      "COPY --from=deps /app/node_modules ./node_modules",
      "COPY . .",
      `EXPOSE ${port}`,
      ...(bool(p, "nonRoot", true) ? ["USER node"] : []),
      `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${port}/ || exit 1`,
      `CMD ["node", "${entry}"]`,
    ];
    return {
      dockerfile: `${lines.join("\n")}\n`,
      files: [{ path: ".dockerignore", content: dockerignore() }],
      notes: [],
    };
  },
};

const pythonRecipe: Recipe = {
  id: "python",
  group: "other",
  fields: [
    { id: "version", kind: "select", default: "3.13", options: ["3.13", "3.12", "3.11"] },
    { id: "port", kind: "number", default: 8000 },
    { id: "entry", kind: "text", default: "main.py" },
  ],
  generate(p) {
    const port = num(p, "port", 8000);
    const lines = [
      `FROM python:${str(p, "version", "3.13")}-slim`,
      "WORKDIR /app",
      "ENV PYTHONUNBUFFERED=1",
      "# Requirements first so `pip install` is cached until they change",
      "COPY requirements.txt ./",
      "RUN pip install --no-cache-dir -r requirements.txt",
      "COPY . .",
      `EXPOSE ${port}`,
      "RUN useradd --create-home app",
      "USER app",
      `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:${port}/')" || exit 1`,
      `CMD ["python", "${str(p, "entry", "main.py")}"]`,
    ];
    return {
      dockerfile: `${lines.join("\n")}\n`,
      files: [
        { path: ".dockerignore", content: dockerignore(["__pycache__/", "*.pyc", ".venv/"]) },
      ],
      notes: [],
    };
  },
};

const goRecipe: Recipe = {
  id: "go",
  group: "other",
  fields: [
    { id: "version", kind: "select", default: "1.24", options: ["1.24", "1.23"] },
    { id: "port", kind: "number", default: 8080 },
  ],
  generate(p) {
    const port = num(p, "port", 8080);
    const lines = [
      `FROM golang:${str(p, "version", "1.24")}-alpine AS build`,
      "WORKDIR /src",
      "COPY go.mod go.sum ./",
      "RUN go mod download",
      "COPY . .",
      "RUN CGO_ENABLED=0 go build -o /out/app .",
      "",
      "FROM alpine:3.20",
      "RUN adduser -D app",
      "COPY --from=build /out/app /usr/local/bin/app",
      `EXPOSE ${port}`,
      "USER app",
      `HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${port}/ || exit 1`,
      'ENTRYPOINT ["app"]',
    ];
    return {
      dockerfile: `${lines.join("\n")}\n`,
      files: [{ path: ".dockerignore", content: dockerignore() }],
      notes: [],
    };
  },
};

const staticRecipe: Recipe = {
  id: "static",
  group: "other",
  fields: [{ id: "folder", kind: "text", default: "." }],
  generate(p) {
    const folder = str(p, "folder", ".");
    const lines = [
      "FROM nginxinc/nginx-unprivileged:1.27-alpine",
      `COPY ${folder} /usr/share/nginx/html`,
      "EXPOSE 8080",
      "USER nginx",
      "HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ || exit 1",
      'CMD ["nginx", "-g", "daemon off;"]',
    ];
    return {
      dockerfile: `${lines.join("\n")}\n`,
      files: [{ path: ".dockerignore", content: dockerignore() }],
      notes: [],
    };
  },
};

export const RECIPES: readonly Recipe[] = [
  dotnetRecipe("web"),
  dotnetRecipe("worker"),
  blazorRecipe,
  nodeRecipe,
  pythonRecipe,
  goRecipe,
  staticRecipe,
];

export const recipeById = (id: RecipeId): Recipe => RECIPES.find((r) => r.id === id) as Recipe;

export const defaultParams = (recipe: Recipe): Params =>
  Object.fromEntries(recipe.fields.map((f) => [f.id, f.default]));

/** Fields currently visible given the answers so far. */
export const visibleFields = (recipe: Recipe, params: Params): RecipeField[] =>
  recipe.fields.filter((f) => !f.when || params[f.when.field] === f.when.is);
