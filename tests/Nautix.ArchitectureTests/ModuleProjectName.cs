namespace Nautix.ArchitectureTests;

/// <summary>Parses <c>Nautix.&lt;Module&gt;.&lt;Layer&gt;</c> project names.</summary>
internal sealed record ModuleProjectName(string Module, string Layer)
{
    public static ModuleProjectName? TryParse(string projectName)
    {
        var parts = projectName.Split('.');
        return parts is ["Nautix", var module, var layer] && ProjectGraph.Layers.Contains(layer)
            ? new ModuleProjectName(module, layer)
            : null;
    }
}
