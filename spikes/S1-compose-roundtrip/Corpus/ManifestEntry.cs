namespace Nautix.Spikes.S1.Corpus;

internal sealed record ManifestEntry(string Id, string Repo, string License, string Url, string Sha256, long Bytes);
