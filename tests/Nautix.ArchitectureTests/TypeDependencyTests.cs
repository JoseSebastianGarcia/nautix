using System.Reflection;
using Nautix.ArchitectureTests.Fixtures;
using Shouldly;

namespace Nautix.ArchitectureTests;

public sealed class TypeDependencyTests
{
    public static TheoryData<string> CoreAssemblies()
    {
        var data = new TheoryData<string>();
        foreach (var module in ProjectGraph.Modules)
        {
            data.Add($"Nautix.{module}.Domain");
            data.Add($"Nautix.{module}.Application");
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(CoreAssemblies))]
    public void Domain_and_application_do_not_depend_on_io_or_ui_types(string assemblyName)
    {
        var assembly = Assembly.Load(assemblyName);

        TypeRules.FindForbiddenDependencies(assembly).ShouldBeEmpty();
    }

    [Theory]
    [MemberData(nameof(CoreAssemblies))]
    public void Domain_and_application_do_not_depend_on_their_infrastructure(string assemblyName)
    {
        var module = assemblyName.Split('.')[1];

        TypeRules.FindDependenciesOnInfrastructure(Assembly.Load(assemblyName), module).ShouldBeEmpty();
    }

    [Fact]
    public void Negative_control_flags_a_type_that_uses_a_named_pipe()
    {
        var failing = TypeRules.FindForbiddenDependencies(
            typeof(PipeUser).Assembly,
            typeof(PipeUser).Namespace);

        failing.ShouldContain(typeof(PipeUser).FullName!);
    }
}
