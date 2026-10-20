using System.Collections.Immutable;
using System.Text.Json;

namespace Nautix.Spikes.S1.Corpus;

internal sealed record CorpusManifest(string Note, string Generated, ImmutableArray<ManifestEntry> Files)
{
    private static readonly JsonSerializerOptions _options = new() { PropertyNameCaseInsensitive = true };

    public static CorpusManifest Load(string path) =>
        JsonSerializer.Deserialize<CorpusManifest>(File.ReadAllText(path), _options)
        ?? throw new InvalidOperationException($"Empty manifest: {path}");
}
