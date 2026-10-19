using System.Reflection;
using NetArchTest.Rules;

namespace Nautix.ArchitectureTests;

/// <summary>Type-level rules (NetArchTest) for the Domain/Application "no I/O" constraint.</summary>
internal static class TypeRules
{
    // Namespaces/types matched by prefix. System.IO.Pipes covers the relay's transport;
    // System.IO.File/Directory cover FileStream, FileInfo, DirectoryInfo too. Stream stays allowed:
    // ports such as image save/load legitimately take it.
    public static readonly string[] ForbiddenInCore =
    [
        "System.Windows",
        "System.IO.Pipes",
        "System.IO.Pipelines",
        "System.IO.File",
        "System.IO.Directory",
        "System.Diagnostics.Process",
        "System.Net.Http",
        "System.Net.Sockets",
        "Docker.DotNet",
        "YamlDotNet",
        "Microsoft.Data.Sqlite",
    ];

    public static IReadOnlyList<string> FindForbiddenDependencies(Assembly assembly, string? inNamespace = null)
    {
        var predicate = inNamespace is null
            ? Types.InAssembly(assembly).That().ResideInNamespaceStartingWith("Nautix")
            : Types.InAssembly(assembly).That().ResideInNamespaceStartingWith(inNamespace);
        var result = predicate.ShouldNot().HaveDependencyOnAny(ForbiddenInCore).GetResult();
        return result.FailingTypeNames ?? [];
    }

    public static IReadOnlyList<string> FindDependenciesOnInfrastructure(Assembly assembly, string module)
    {
        var result = Types.InAssembly(assembly)
            .ShouldNot().HaveDependencyOn($"Nautix.{module}.Infrastructure")
            .GetResult();
        return result.FailingTypeNames ?? [];
    }
}
