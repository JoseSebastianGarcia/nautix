using System.Collections.Immutable;

namespace Nautix.Spikes.Common;

/// <summary>One measured criterion of a spike: what was checked, the numbers, and whether it met the gate.</summary>
public sealed record CheckResult(
    string Name,
    bool Passed,
    string Gate,
    ImmutableDictionary<string, double> Metrics,
    string Notes)
{
    public static CheckResult Create(string name, bool passed, string gate, string notes = "", params (string Key, double Value)[] metrics) =>
        new(name, passed, gate, metrics.ToImmutableDictionary(m => m.Key, m => m.Value, StringComparer.Ordinal), notes);
}
