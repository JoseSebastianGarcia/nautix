import { describe, expect, it } from "vitest";
import {
  assemblyOf,
  defaultParams,
  lintDockerfile,
  parseDockerfile,
  RECIPES,
  recipeById,
  visibleFields,
} from "./index.js";

const generate = (
  id: Parameters<typeof recipeById>[0],
  over: Record<string, string | number | boolean> = {},
) => {
  const recipe = recipeById(id);
  return recipe.generate({ ...defaultParams(recipe), ...over });
};

describe("recipes", () => {
  it.each(RECIPES.map((r) => r.id))(
    "%s generates a Dockerfile with no lint warnings or errors",
    (id) => {
      const out = generate(id);
      expect(
        lintDockerfile(out.dockerfile).filter((i) => i.severity !== "info"),
        out.dockerfile,
      ).toEqual([]);
      expect(out.files.some((f) => f.path === ".dockerignore")).toBe(true);
    },
  );

  it("builds an ASP.NET Core API on .NET 10 with a cached restore layer", () => {
    const out = generate("dotnet-web", { project: "src/Shop.Api/Shop.Api.csproj", port: 8080 });
    const lines = out.dockerfile.split("\n");
    expect(lines[0]).toBe("FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build");
    expect(out.dockerfile).toContain("FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS final");
    expect(out.dockerfile).toContain('COPY ["src/Shop.Api/Shop.Api.csproj", "src/Shop.Api/"]');
    expect(out.dockerfile).toContain('ENTRYPOINT ["dotnet", "Shop.Api.dll"]');
    expect(out.dockerfile).toContain("ENV ASPNETCORE_HTTP_PORTS=8080");
    expect(out.dockerfile).toContain("USER $APP_UID");
    expect(out.dockerfile).toContain("HEALTHCHECK");
    // restore comes before the rest of the sources are copied
    expect(out.dockerfile.indexOf("RUN dotnet restore")).toBeLessThan(
      out.dockerfile.indexOf("COPY . ."),
    );
    expect(parseDockerfile(out.dockerfile).stages.map((s) => s.name)).toEqual(["build", "final"]);
  });

  it("restores every project of a solution so their packages are cached together", () => {
    const out = generate("dotnet-web", {
      project: "src/Api/Api.csproj",
      extraProjects: "src/Core/Core.csproj\nsrc/Data/Data.csproj\n",
    });
    expect(out.dockerfile).toContain('COPY ["src/Core/Core.csproj", "src/Core/"]');
    expect(out.dockerfile).toContain('COPY ["src/Data/Data.csproj", "src/Data/"]');
    expect(out.dockerfile.indexOf("src/Data/Data.csproj")).toBeLessThan(
      out.dockerfile.indexOf("dotnet restore"),
    );
  });

  it("picks the right base image for each flavor and version", () => {
    expect(generate("dotnet-web", { flavor: "debian" }).dockerfile).toContain(
      "aspnet:10.0 AS final",
    );
    expect(generate("dotnet-web", { flavor: "chiseled" }).dockerfile).toContain(
      "aspnet:10.0-noble-chiseled AS final",
    );
    expect(generate("dotnet-web", { flavor: "chiseled", version: "8.0" }).dockerfile).toContain(
      "aspnet:8.0-jammy-chiseled AS final",
    );
    expect(generate("dotnet-web", { version: "9.0" }).dockerfile).toContain("sdk:9.0 AS build");
  });

  it("only adds a health check where the image has wget", () => {
    expect(generate("dotnet-web", { flavor: "alpine" }).dockerfile).toContain("HEALTHCHECK");
    for (const flavor of ["debian", "chiseled"]) {
      const out = generate("dotnet-web", { flavor });
      expect(out.dockerfile).not.toContain("HEALTHCHECK");
      expect(out.notes.map((n) => n.key)).toContain("noTools");
    }
    expect(generate("dotnet-web", { healthPath: "" }).dockerfile).not.toContain("HEALTHCHECK");
    expect(generate("dotnet-web", { healthPath: "healthz" }).dockerfile).toContain(
      "127.0.0.1:8080/healthz",
    );
  });

  it("derives the assembly name from the project unless told otherwise", () => {
    expect(assemblyOf("src/Shop.Api/Shop.Api.csproj")).toBe("Shop.Api");
    expect(assemblyOf("App.fsproj")).toBe("App");
    expect(generate("dotnet-web", { project: "a/B.csproj" }).dockerfile).toContain('"B.dll"');
    expect(
      generate("dotnet-web", { project: "a/B.csproj", assembly: "Custom" }).dockerfile,
    ).toContain('"Custom.dll"');
  });

  it("a worker service uses the runtime image and publishes no port", () => {
    const out = generate("dotnet-worker", { project: "src/Jobs/Jobs.csproj" });
    expect(out.dockerfile).toContain("dotnet/runtime:10.0-alpine AS final");
    expect(out.dockerfile).not.toContain("EXPOSE");
    expect(out.dockerfile).not.toContain("HEALTHCHECK");
    expect(out.dockerfile).not.toContain("ASPNETCORE");
  });

  it("Blazor WebAssembly ends in unprivileged nginx with an SPA fallback config", () => {
    const out = generate("dotnet-blazor", { project: "src/Web/Web.csproj" });
    expect(out.dockerfile).toContain("FROM nginxinc/nginx-unprivileged");
    expect(out.dockerfile).toContain(
      "COPY --from=build /app/publish/wwwroot /usr/share/nginx/html",
    );
    expect(out.files.find((f) => f.path === "nginx.conf")?.content).toContain(
      "try_files $uri $uri/ /index.html",
    );
  });

  it("non-root can be turned off", () => {
    expect(generate("dotnet-web", { nonRoot: false }).dockerfile).not.toContain("USER");
    expect(generate("node", { nonRoot: false }).dockerfile).not.toContain("USER node");
  });

  it("shows a field only when its condition holds", () => {
    const r = recipeById("dotnet-web");
    expect(visibleFields(r, { flavor: "alpine" }).some((f) => f.id === "healthPath")).toBe(true);
    expect(visibleFields(r, { flavor: "chiseled" }).some((f) => f.id === "healthPath")).toBe(false);
  });

  it("falls back to defaults for nonsense numbers", () => {
    expect(generate("dotnet-web", { port: -5 }).dockerfile).toContain("ASPNETCORE_HTTP_PORTS=8080");
    expect(generate("node", { port: 99999 }).dockerfile).toContain("EXPOSE 3000");
  });
});
