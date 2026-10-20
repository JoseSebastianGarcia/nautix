namespace Nautix.Spikes.S1.Editing;

/// <summary>Append <c>key: value</c> as the last entry of the block mapping at <see cref="Mapping"/>.</summary>
internal sealed record AddKey(YamlPath Mapping, string Key, string Value) : ComposeEdit;
