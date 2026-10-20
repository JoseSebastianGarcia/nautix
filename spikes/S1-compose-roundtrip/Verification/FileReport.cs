using System.Collections.Immutable;

namespace Nautix.Spikes.S1.Verification;

internal sealed record FileReport(
    string Id,
    string Source,
    int Bytes,
    int Lines,
    string? ParseError,
    bool BytesRoundTrip,
    bool NoOpExact,
    ImmutableArray<string> FidelityViolations,
    ImmutableArray<EditOutcome> Edits)
{
    public bool Passed =>
        ParseError is null && BytesRoundTrip && NoOpExact && FidelityViolations.IsEmpty
        && Edits.All(e => e.Status != EditStatus.Fail);

    public IEnumerable<string> Problems()
    {
        if (ParseError is not null)
        {
            yield return "parse: " + ParseError;
        }

        if (!BytesRoundTrip)
        {
            yield return "bytes do not survive decode/encode";
        }

        if (!NoOpExact)
        {
            yield return "no-op patch changed the text";
        }

        foreach (var v in FidelityViolations)
        {
            yield return "fidelity: " + v;
        }

        foreach (var e in Edits.Where(e => e.Status == EditStatus.Fail))
        {
            yield return $"{e.Kind} {e.Path}: {e.Detail}";
        }
    }
}
