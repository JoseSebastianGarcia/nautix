namespace Nautix.Spikes.S1.Editing;

internal sealed record AppendItem(YamlPath Sequence, string Value) : ComposeEdit;
