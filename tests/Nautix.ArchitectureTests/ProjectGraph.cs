using System.Collections.Immutable;
using Nautix.TestKit;

namespace Nautix.ArchitectureTests;

internal static class ProjectGraph
{
    public static readonly ImmutableArray<string> Modules =
    [
        "Containers", "Images", "Networks", "Volumes", "Compose", "Dockerfile", "Builds",
        "Registries", "Swarm", "EngineHost", "System", "Terminal", "Settings",
    ];

    public static readonly ImmutableArray<string> Layers = ["Domain", "Application", "Infrastructure", "Contracts"];

    public static ImmutableArray<ProjectInfo> LoadSourceProjects() =>
    [
        .. Directory.EnumerateFiles(RepositoryLocator.SourceDirectory, "*.csproj", SearchOption.AllDirectories)
            .Select(ProjectInfo.Load)
            .OrderBy(p => p.Name, StringComparer.Ordinal),
    ];

    public static IEnumerable<string> ExpectedModuleProjects() =>
        from module in Modules
        from layer in Layers
        select $"Nautix.{module}.{layer}";
}
