namespace Nautix.Spikes.S1.Yaml;

/// <summary>
/// The parser's end mark of a block collection is the start of the next token, not the end of its content,
/// so the content end is derived from the deepest last child.
/// </summary>
internal static class YamlExtents
{
    /// <summary>Exclusive end of the last non-empty content of <paramref name="node"/>.</summary>
    public static int ContentEnd(YamlNode node) => node switch
    {
        YamlScalar { IsEmpty: true } scalar => scalar.Start,
        YamlMapping { IsFlow: false } m => m.Entries.Length == 0 ? m.End : Math.Max(m.Entries[^1].Key.End, ContentEnd(m.Entries[^1].Value)),
        YamlSequence { IsFlow: false } s => s.Items.Length == 0 ? s.End : ContentEnd(s.Items[^1]),
        _ => node.End,
    };
}
