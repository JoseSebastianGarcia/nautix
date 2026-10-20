using System.Collections.Immutable;
using System.Text;
using Nautix.Spikes.S1.Editing;

namespace Nautix.Spikes.S1.Verification;

internal static class RoundTripRunner
{
    private static readonly UTF8Encoding _strictUtf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);

    public static FileReport Run(IYamlDocumentStore store, string id, string source, byte[] bytes)
    {
        ArgumentNullException.ThrowIfNull(store);
        ArgumentNullException.ThrowIfNull(bytes);

        string text;
        try
        {
            text = _strictUtf8.GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return new FileReport(id, source, bytes.Length, 0, "not valid UTF-8", false, false, [], []);
        }

        var lines = text.Count(c => c == '\n') + 1;
        var bytesRoundTrip = _strictUtf8.GetBytes(text).AsSpan().SequenceEqual(bytes);

        var parsed = store.Parse(text);
        if (parsed.IsFailure)
        {
            return new FileReport(id, source, bytes.Length, lines, parsed.Error.Message, bytesRoundTrip, false, [], []);
        }

        var tree = parsed.Value;
        var noOp = store.ToPatch(tree, new NoOp());
        var noOpExact = noOp.IsSuccess && store.Apply(text, noOp.Value) == text;
        var fidelity = MarkFidelity.Check(tree).ToImmutableArray();
        var edits = EditSiteFinder.Find(tree).Select(site => EditChecker.Check(store, tree, site)).ToImmutableArray();

        return new FileReport(id, source, bytes.Length, lines, null, bytesRoundTrip, noOpExact, fidelity, edits);
    }
}
