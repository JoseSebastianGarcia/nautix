namespace Nautix.Spikes.S1.Yaml;

internal sealed record YamlAlias(int Start, int End, string Name) : YamlNode(Start, End);
