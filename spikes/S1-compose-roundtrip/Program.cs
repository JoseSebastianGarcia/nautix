using System.Collections.Immutable;
using Nautix.Spikes.S1.Corpus;
using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Verification;

// S1 — Compose round-trip spike. Usage:
//   fetch                  download third-party corpus files listed in corpus/compose/manifest.json
//   run [--report <file>]  run the gate over downloaded real files + committed synthetic files
var command = args.FirstOrDefault() ?? "run";
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};

var corpus = RepositoryPaths.ComposeCorpus;
var downloaded = Path.Combine(corpus, "downloaded");

if (command == "fetch")
{
    return await CorpusFetcher.FetchAsync(Path.Combine(corpus, "manifest.json"), downloaded, Console.Out, cts.Token);
}

if (command != "run")
{
    await Console.Error.WriteLineAsync("Unknown command. Use: fetch | run [--report <file>]");
    return 2;
}

IYamlDocumentStore store = new YamlDocumentStore();
var manifest = CorpusManifest.Load(Path.Combine(corpus, "manifest.json"));
var real = ImmutableArray.CreateBuilder<FileReport>();
var missing = new List<string>();
foreach (var entry in manifest.Files)
{
    var path = Path.Combine(downloaded, entry.Id);
    if (!File.Exists(path))
    {
        missing.Add(entry.Id);
        continue;
    }

    real.Add(RoundTripRunner.Run(store, entry.Id, "real", await File.ReadAllBytesAsync(path, cts.Token)));
}

if (missing.Count > 0)
{
    Console.WriteLine($"WARNING {missing.Count} manifest file(s) not available (not fetched, or upstream drifted) and excluded: {string.Join(", ", missing)}");
}

if (real.Count == 0)
{
    await Console.Error.WriteLineAsync("No real corpus files available. Run the fetch command first.");
    return 2;
}

var synthetic = ImmutableArray.CreateBuilder<FileReport>();
foreach (var path in Directory.EnumerateFiles(Path.Combine(corpus, "synthetic"), "*.yaml").Order(StringComparer.Ordinal))
{
    synthetic.Add(RoundTripRunner.Run(store, Path.GetFileName(path), "synthetic", await File.ReadAllBytesAsync(path, cts.Token)));
}

var report = new GateReport(real.ToImmutable(), synthetic.ToImmutable());
var rendered = report.Render();
Console.WriteLine(rendered);

var largest = manifest.Files.Where(f => File.Exists(Path.Combine(downloaded, f.Id))).MaxBy(f => f.Bytes)!;
var largestText = await File.ReadAllTextAsync(Path.Combine(downloaded, largest.Id), cts.Token);
foreach (var (label, text) in new[] { ($"largest real file ({largest.Id}, {largestText.Count(c => c == '\n')} lines)", largestText), ("synthetic 1000+ lines", LatencyProbe.Synthesize1000Lines()) })
{
    var (parse, edit) = LatencyProbe.Measure(store, text, 200);
    Console.WriteLine($"LATENCY p95  {label}: parse {parse:F2} ms, patch+apply {edit:F3} ms  (target < 10 ms)");
}

var reportIndex = Array.IndexOf(args, "--report");
if (reportIndex >= 0 && reportIndex + 1 < args.Length)
{
    await File.WriteAllTextAsync(args[reportIndex + 1], rendered, cts.Token);
}

return report.GatePassed ? 0 : 1;
