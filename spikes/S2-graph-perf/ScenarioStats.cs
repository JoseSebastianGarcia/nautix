namespace Nautix.Spikes.S2;

internal sealed record ScenarioStats(string Name, int Frames, double AvgFps, double P95FrameMs, double P99FrameMs, double WorstFrameMs, double PercentOver50Ms)
{
    public const double RequiredAvgFps = 30;
    public const double MaxP95FrameMs = 34;

    public bool MeetsGate => AvgFps >= RequiredAvgFps && P95FrameMs <= MaxP95FrameMs;

    public static ScenarioStats From(string name, IReadOnlyList<double> frameMs)
    {
        if (frameMs.Count == 0)
        {
            return new ScenarioStats(name, 0, 0, double.PositiveInfinity, double.PositiveInfinity, double.PositiveInfinity, 100);
        }

        var sorted = frameMs.Order().ToArray();
        double At(double fraction) => sorted[Math.Min(sorted.Length - 1, (int)Math.Floor(sorted.Length * fraction))];
        return new ScenarioStats(
            name,
            frameMs.Count,
            1000.0 / frameMs.Average(),
            At(0.95),
            At(0.99),
            sorted[^1],
            100.0 * frameMs.Count(f => f > 50) / frameMs.Count);
    }
}
