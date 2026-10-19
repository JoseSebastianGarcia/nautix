using System.Collections.Immutable;

namespace Nautix.ArchitectureTests;

/// <summary>Dependency rules of docs/spec/01-architecture.md, expressed over project references.</summary>
internal static class LayerRules
{
    private const string SharedKernel = "Nautix.SharedKernel";
    private const string HostWpf = "Nautix.Host.Wpf";

    private static readonly ImmutableArray<string> _windowsUiProjects = [HostWpf, "Nautix.Ui.Wpf"];

    // Packages that perform I/O or belong to a UI/infrastructure concern; forbidden in Domain/Application.
    private static readonly ImmutableArray<string> _forbiddenInCore =
    [
        "Docker.DotNet", "YamlDotNet", "Microsoft.Data.Sqlite", "SQLitePCLRaw", "System.IO.Pipelines",
        "WPF-UI", "Nodify", "AvalonEdit", "Microsoft.Terminal.Wpf", "Microsoft.Extensions.Hosting",
    ];

    public static IReadOnlyList<string> Validate(IEnumerable<ProjectInfo> projects)
    {
        var violations = new List<string>();
        foreach (var project in projects)
        {
            violations.AddRange(ValidateReferences(project));
            violations.AddRange(ValidatePackages(project));
            violations.AddRange(ValidateWindowsUi(project));
        }

        return violations;
    }

    private static IEnumerable<string> ValidateReferences(ProjectInfo project)
    {
        var name = ModuleProjectName.TryParse(project.Name);
        foreach (var reference in project.ProjectReferences)
        {
            var target = ModuleProjectName.TryParse(reference);

            if (name is null)
            {
                if (project.Name == SharedKernel)
                {
                    yield return $"{project.Name} must not reference any project (found {reference}).";
                }
                else if (project.Name != HostWpf && target is { Layer: not "Contracts" })
                {
                    yield return $"{project.Name} may only reference module Contracts (found {reference}).";
                }

                continue;
            }

            var allowed = reference == SharedKernel
                || (target is not null && IsAllowedModuleReference(name, target));
            if (!allowed)
            {
                yield return $"{project.Name} must not reference {reference}.";
            }
        }
    }

    private static bool IsAllowedModuleReference(ModuleProjectName from, ModuleProjectName to)
    {
        if (to.Layer == "Contracts")
        {
            // Contracts are the only cross-module surface: Application may use any module's,
            // Infrastructure only its own. Domain and Contracts see SharedKernel only.
            return from.Layer == "Application" || (from.Layer == "Infrastructure" && from.Module == to.Module);
        }

        if (from.Module != to.Module)
        {
            return false;
        }

        return from.Layer switch
        {
            "Application" => to.Layer == "Domain",
            "Infrastructure" => to.Layer is "Application" or "Domain",
            _ => false,
        };
    }

    private static IEnumerable<string> ValidatePackages(ProjectInfo project)
    {
        var name = ModuleProjectName.TryParse(project.Name);
        if (name?.Layer is not ("Domain" or "Application"))
        {
            yield break;
        }

        foreach (var package in project.PackageReferences)
        {
            if (_forbiddenInCore.Any(f => package.StartsWith(f, StringComparison.OrdinalIgnoreCase)))
            {
                yield return $"{project.Name} ({name.Layer}) must not use package {package}.";
            }
        }
    }

    private static IEnumerable<string> ValidateWindowsUi(ProjectInfo project)
    {
        if (project.UsesWindowsUi && !_windowsUiProjects.Contains(project.Name))
        {
            yield return $"{project.Name} uses WPF/Windows UI; only {string.Join(", ", _windowsUiProjects)} may.";
        }
    }
}
