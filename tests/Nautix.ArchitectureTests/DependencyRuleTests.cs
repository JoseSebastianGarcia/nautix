using System.Collections.Immutable;
using Shouldly;

namespace Nautix.ArchitectureTests;

public sealed class DependencyRuleTests
{
    [Fact]
    public void Source_projects_respect_the_layer_rules()
    {
        LayerRules.Validate(ProjectGraph.LoadSourceProjects()).ShouldBeEmpty();
    }

    [Fact]
    public void Only_the_composition_root_references_infrastructure_projects()
    {
        var offenders = ProjectGraph.LoadSourceProjects()
            .Where(p => p.Name != "Nautix.Host.Wpf")
            .SelectMany(p => p.ProjectReferences.Where(r => r.EndsWith(".Infrastructure", StringComparison.Ordinal))
                .Select(r => $"{p.Name} -> {r}"))
            .Where(edge => ModuleProjectName.TryParse(edge.Split(" -> ")[0])?.Layer != "Infrastructure"
                || edge.Split(" -> ")[0].Split('.')[1] != edge.Split(" -> ")[1].Split('.')[1]);

        offenders.ShouldBeEmpty();
    }

    [Fact]
    public void Host_wpf_wires_every_module_infrastructure()
    {
        var host = ProjectGraph.LoadSourceProjects().Single(p => p.Name == "Nautix.Host.Wpf");

        ProjectGraph.Modules
            .Select(m => $"Nautix.{m}.Infrastructure")
            .Where(i => !host.ProjectReferences.Contains(i))
            .ShouldBeEmpty();
    }

    // Negative controls: prove the rules are not vacuous on an empty skeleton.
    [Theory]
    [InlineData("Nautix.Containers.Domain", "Nautix.Images.Contracts")]
    [InlineData("Nautix.Containers.Domain", "Nautix.Containers.Application")]
    [InlineData("Nautix.Containers.Application", "Nautix.Images.Domain")]
    [InlineData("Nautix.Containers.Application", "Nautix.Containers.Infrastructure")]
    [InlineData("Nautix.Containers.Infrastructure", "Nautix.Images.Application")]
    [InlineData("Nautix.Containers.Infrastructure", "Nautix.Images.Contracts")]
    [InlineData("Nautix.Containers.Contracts", "Nautix.Containers.Domain")]
    [InlineData("Nautix.SharedKernel", "Nautix.Containers.Contracts")]
    [InlineData("Nautix.Ui", "Nautix.Containers.Application")]
    public void Forbidden_reference_is_reported(string from, string to)
    {
        var project = Project(from, references: [to]);

        LayerRules.Validate([project]).ShouldNotBeEmpty();
    }

    [Theory]
    [InlineData("Nautix.Containers.Domain", "Nautix.SharedKernel")]
    [InlineData("Nautix.Containers.Application", "Nautix.Containers.Domain")]
    [InlineData("Nautix.Containers.Application", "Nautix.Images.Contracts")]
    [InlineData("Nautix.Containers.Infrastructure", "Nautix.Containers.Application")]
    [InlineData("Nautix.Containers.Infrastructure", "Nautix.Containers.Contracts")]
    [InlineData("Nautix.Ui", "Nautix.SharedKernel")]
    [InlineData("Nautix.Host.Wpf", "Nautix.Containers.Infrastructure")]
    public void Allowed_reference_is_accepted(string from, string to)
    {
        var project = Project(from, references: [to]);

        LayerRules.Validate([project]).ShouldBeEmpty();
    }

    [Fact]
    public void Forbidden_package_in_application_is_reported()
    {
        var project = Project("Nautix.Containers.Application", packages: ["Docker.DotNet"]);

        LayerRules.Validate([project]).ShouldNotBeEmpty();
    }

    [Fact]
    public void Wpf_outside_the_ui_projects_is_reported()
    {
        var project = Project("Nautix.Containers.Infrastructure", windowsUi: true);

        LayerRules.Validate([project]).ShouldNotBeEmpty();
    }

    [Fact]
    public void Wpf_in_host_and_ui_wpf_is_accepted()
    {
        LayerRules.Validate([Project("Nautix.Host.Wpf", windowsUi: true), Project("Nautix.Ui.Wpf", windowsUi: true)])
            .ShouldBeEmpty();
    }

    private static ProjectInfo Project(
        string name,
        string[]? references = null,
        string[]? packages = null,
        bool windowsUi = false) =>
        new(name, "net10.0", windowsUi, [.. references ?? []], [.. packages ?? []]);
}
