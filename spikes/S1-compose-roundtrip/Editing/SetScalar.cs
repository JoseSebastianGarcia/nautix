namespace Nautix.Spikes.S1.Editing;

internal sealed record SetScalar(YamlPath Path, string Value) : ComposeEdit;
