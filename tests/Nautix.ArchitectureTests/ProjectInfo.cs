using System.Collections.Immutable;
using System.Xml.Linq;

namespace Nautix.ArchitectureTests;

/// <summary>Static facts about one csproj, read from the file (no MSBuild evaluation).</summary>
internal sealed record ProjectInfo(
    string Name,
    string TargetFramework,
    bool UsesWindowsUi,
    ImmutableArray<string> ProjectReferences,
    ImmutableArray<string> PackageReferences)
{
    public static ProjectInfo Load(string csprojPath)
    {
        var document = XDocument.Load(csprojPath);
        var properties = document.Descendants("PropertyGroup").Elements().ToList();

        string Property(string name) =>
            properties.FirstOrDefault(e => e.Name.LocalName == name)?.Value.Trim() ?? string.Empty;

        var targetFramework = Property("TargetFramework");
        var usesWindowsUi =
            string.Equals(Property("UseWPF"), "true", StringComparison.OrdinalIgnoreCase)
            || string.Equals(Property("UseWindowsForms"), "true", StringComparison.OrdinalIgnoreCase)
            || targetFramework.Contains("-windows", StringComparison.OrdinalIgnoreCase);

        return new ProjectInfo(
            Path.GetFileNameWithoutExtension(csprojPath),
            targetFramework,
            usesWindowsUi,
            [.. document.Descendants("ProjectReference")
                .Select(e => Path.GetFileNameWithoutExtension(
                    (e.Attribute("Include")?.Value ?? string.Empty).Replace('\\', '/')))],
            [.. document.Descendants("PackageReference")
                .Select(e => e.Attribute("Include")?.Value ?? string.Empty)]);
    }
}
