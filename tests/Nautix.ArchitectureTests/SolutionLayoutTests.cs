using System.Text.RegularExpressions;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.ArchitectureTests;

public sealed partial class SolutionLayoutTests
{
    [Fact]
    public void Every_module_has_the_four_layer_projects_on_disk()
    {
        var onDisk = ProjectGraph.LoadSourceProjects().Select(p => p.Name).ToHashSet(StringComparer.Ordinal);

        ProjectGraph.ExpectedModuleProjects().Where(p => !onDisk.Contains(p)).ShouldBeEmpty();
    }

    [Fact]
    public void Every_source_project_is_in_the_solution()
    {
        var inSolution = SolutionProjectRegex().Matches(File.ReadAllText(RepositoryLocator.SolutionFile))
            .Select(m => m.Groups["name"].Value)
            .ToHashSet(StringComparer.Ordinal);

        ProjectGraph.LoadSourceProjects().Select(p => p.Name).Where(n => !inSolution.Contains(n)).ShouldBeEmpty();
    }

    [Fact]
    public void Module_projects_live_under_the_module_folder()
    {
        foreach (var project in ProjectGraph.ExpectedModuleProjects())
        {
            var module = project.Split('.')[1];
            var csproj = Path.Combine(RepositoryLocator.SourceDirectory, "Modules", module, project, project + ".csproj");
            File.Exists(csproj).ShouldBeTrue(csproj);
        }
    }

    [GeneratedRegex(@"Project\(""\{[^}]+\}""\)\s*=\s*""(?<name>[^""]+)""", RegexOptions.None, matchTimeoutMilliseconds: 2000)]
    private static partial Regex SolutionProjectRegex();
}
