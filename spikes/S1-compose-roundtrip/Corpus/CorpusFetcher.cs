using System.Security.Cryptography;

namespace Nautix.Spikes.S1.Corpus;

/// <summary>Downloads third-party corpus files (never committed) and verifies each against its pinned sha256.</summary>
internal static class CorpusFetcher
{
    public static async Task<int> FetchAsync(string manifestPath, string destination, TextWriter log, CancellationToken ct)
    {
        var manifest = CorpusManifest.Load(manifestPath);
        Directory.CreateDirectory(destination);
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        int ok = 0, cached = 0, drift = 0, failed = 0;

        foreach (var entry in manifest.Files)
        {
            var target = Path.Combine(destination, entry.Id);
            if (File.Exists(target) && Hash(await File.ReadAllBytesAsync(target, ct)) == entry.Sha256)
            {
                cached++;
                continue;
            }

            try
            {
                var bytes = await http.GetByteArrayAsync(new Uri(entry.Url), ct);
                if (Hash(bytes) != entry.Sha256)
                {
                    drift++;
                    await log.WriteLineAsync($"DRIFT  {entry.Id}: upstream content changed (expected {entry.Sha256[..12]}…, got {Hash(bytes)[..12]}…). Not saved; re-pin deliberately.");
                    continue;
                }

                await File.WriteAllBytesAsync(target, bytes, ct);
                ok++;
            }
            catch (HttpRequestException ex)
            {
                failed++;
                await log.WriteLineAsync($"FAILED {entry.Id}: {ex.Message}");
            }
        }

        await log.WriteLineAsync($"fetch: {ok} downloaded, {cached} already present, {drift} drifted, {failed} failed (of {manifest.Files.Length}).");
        return drift + failed == 0 ? 0 : 1;
    }

    private static string Hash(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));
}
