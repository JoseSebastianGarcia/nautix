namespace Nautix.Spikes.S1.Editing;

/// <summary>Remove the entry whose value lives at <see cref="Entry"/> (last segment is the key).</summary>
internal sealed record RemoveKey(YamlPath Entry) : ComposeEdit;
