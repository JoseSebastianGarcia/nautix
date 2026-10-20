namespace Nautix.Spikes.S1.Yaml;

internal sealed record YamlMappingEntry(YamlNode Key, YamlNode Value)
{
    public string? KeyText => Key is YamlScalar scalar ? scalar.Value : null;
}
