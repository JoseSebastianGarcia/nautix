namespace Nautix.Spikes.S1.Yaml;

/// <summary>A scalar. The span excludes anchor/tag properties; an empty value (null) has Start == End.</summary>
internal sealed record YamlScalar(int Start, int End, string? Anchor, string Value, YamlScalarStyle Style) : YamlNode(Start, End)
{
    public bool IsEmpty => Style == YamlScalarStyle.Plain && Value.Length == 0;
}
