using System.Collections.Immutable;
using System.Globalization;
using System.Text;

namespace Nautix.Spikes.S1.Verification;

/// <summary>Aggregates file reports into the S1 gate numbers (docs/spec/07-roadmap.md, M0).</summary>
internal sealed record GateReport(ImmutableArray<FileReport> Real, ImmutableArray<FileReport> Synthetic)
{
    public const double RequiredRate = 0.98;

    public double RealPassRate => Real.Length == 0 ? 0 : (double)Real.Count(r => r.Passed) / Real.Length;

    public bool GatePassed => Real.Length >= 50 && RealPassRate >= RequiredRate && Real.All(r => r.NoOpExact && r.BytesRoundTrip);

    public string Render()
    {
        var sb = new StringBuilder();
        Section(sb, "REAL-WORLD CORPUS (gate)", Real);
        Section(sb, "SYNTHETIC EDGE CASES (not gated; limitations listed)", Synthetic);
        sb.AppendLine(CultureInfo.InvariantCulture, $"GATE  files={Real.Length} (need >= 50)  passed={Real.Count(r => r.Passed)}  rate={RealPassRate:P1} (need >= {RequiredRate:P0})  no-op byte-exact={Real.Count(r => r.NoOpExact && r.BytesRoundTrip)}/{Real.Length}  => {(GatePassed ? "PASS" : "FAIL")}");
        return sb.ToString();
    }

    private static void Section(StringBuilder sb, string title, ImmutableArray<FileReport> reports)
    {
        sb.AppendLine(CultureInfo.InvariantCulture, $"== {title}: {reports.Count(r => r.Passed)}/{reports.Length} files pass");
        var edits = reports.SelectMany(r => r.Edits).ToList();
        foreach (var group in edits.GroupBy(e => e.Kind).OrderBy(g => g.Key, StringComparer.Ordinal))
        {
            sb.AppendLine(CultureInfo.InvariantCulture, $"   {group.Key,-12} pass={group.Count(e => e.Status == EditStatus.Pass),4}  not-applicable={group.Count(e => e.Status == EditStatus.NotApplicable),4}  FAIL={group.Count(e => e.Status == EditStatus.Fail),4}");
        }

        foreach (var reason in edits.Where(e => e.Status == EditStatus.NotApplicable).GroupBy(e => e.Detail).OrderByDescending(g => g.Count()))
        {
            sb.AppendLine(CultureInfo.InvariantCulture, $"   not-applicable reason '{reason.Key}': {reason.Count()}");
        }

        foreach (var report in reports.Where(r => !r.Passed))
        {
            sb.AppendLine(CultureInfo.InvariantCulture, $"   FAIL {report.Id} ({report.Bytes} B, {report.Lines} lines)");
            foreach (var problem in report.Problems().Take(6))
            {
                sb.AppendLine(CultureInfo.InvariantCulture, $"        - {problem}");
            }
        }
    }
}
