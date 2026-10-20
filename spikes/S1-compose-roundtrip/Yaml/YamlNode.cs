namespace Nautix.Spikes.S1.Yaml;

/// <summary>A node with its character span in the source text ([Start, End), UTF-16 offsets, BOM included).</summary>
internal abstract record YamlNode(int Start, int End);
