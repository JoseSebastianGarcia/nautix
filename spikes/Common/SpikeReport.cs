using System.Collections.Immutable;
using System.Text.Json;

namespace Nautix.Spikes.Common;

/// <summary>The JSON a user pastes back after running a spike on their machine.</summary>
public sealed record SpikeReport(string Spike, DateTimeOffset RunAt, MachineInfo Machine, ImmutableArray<CheckResult> Checks)
{
    private static readonly JsonSerializerOptions _json = new() { WriteIndented = true };

    public bool AllPassed => Checks.All(c => c.Passed);

    public int SkippedCount => Checks.Count(c => c.Skipped);

    public string ToJson() => JsonSerializer.Serialize(this, _json);

    public string ToConsoleText()
    {
        var lines = new List<string> { $"== {Spike} on {Machine.Summary}" };
        foreach (var check in Checks)
        {
            lines.Add($"[{(check.Skipped ? "SKIP" : check.Passed ? "PASS" : "FAIL")}] {check.Name}  (gate: {check.Gate})");
            lines.AddRange(check.Metrics.OrderBy(m => m.Key, StringComparer.Ordinal).Select(m => $"        {m.Key} = {m.Value:0.###}"));
            if (check.Notes.Length > 0)
            {
                lines.Add("        " + check.Notes);
            }
        }

        lines.Add(AllPassed ? $"RESULT: all checks passed ({SkippedCount} skipped)" : "RESULT: at least one check FAILED");
        return string.Join(Environment.NewLine, lines);
    }

    public async Task SaveAsync(string directory, CancellationToken ct)
    {
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, $"{Spike}-{RunAt:yyyyMMdd-HHmmss}.json");
        await File.WriteAllTextAsync(path, ToJson(), ct);
    }
}
