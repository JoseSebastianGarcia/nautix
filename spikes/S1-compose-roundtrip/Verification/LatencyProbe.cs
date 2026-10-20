using System.Diagnostics;
using Nautix.Spikes.S1.Editing;

namespace Nautix.Spikes.S1.Verification;

/// <summary>Spec target: a patch on a 1000-line file in under 10 ms (docs/spec/06, performance row).</summary>
internal static class LatencyProbe
{
    public static (double ParseMs, double EditMs) Measure(IYamlDocumentStore store, string text, int iterations)
    {
        ArgumentNullException.ThrowIfNull(store);
        var parse = new double[iterations];
        var edit = new double[iterations];
        var tree = store.Parse(text).Value;
        var site = EditSiteFinder.Find(tree).First(s => s.Kind == EditSiteFinder.SetScalarKind);

        for (var i = 0; i < iterations; i++)
        {
            var t0 = Stopwatch.GetTimestamp();
            _ = store.Parse(text);
            var t1 = Stopwatch.GetTimestamp();
            _ = store.Apply(text, store.ToPatch(tree, site.Edit).Value);
            var t2 = Stopwatch.GetTimestamp();
            parse[i] = Stopwatch.GetElapsedTime(t0, t1).TotalMilliseconds;
            edit[i] = Stopwatch.GetElapsedTime(t1, t2).TotalMilliseconds;
        }

        return (Percentile95(parse), Percentile95(edit));
    }

    /// <summary>A realistic 1000+ line compose file made of repeated service blocks.</summary>
    public static string Synthesize1000Lines()
    {
        var sb = new System.Text.StringBuilder("services:\n");
        for (var i = 0; i < 70; i++)
        {
            sb.Append(System.Globalization.CultureInfo.InvariantCulture, $"  svc{i}:\n    image: app{i}:1.0\n    restart: always\n    ports:\n      - \"{8000 + i}:80\"\n    environment:\n      A: \"1\"\n      B: two\n    healthcheck:\n      test: [\"CMD\", \"true\"]\n      interval: 5s\n    depends_on:\n      - svc0\n    labels:\n      team: core\n");
        }

        return sb.ToString();
    }

    private static double Percentile95(double[] samples)
    {
        var sorted = samples.Order().ToArray();
        return sorted[(int)Math.Floor(sorted.Length * 0.95) - 1];
    }
}
