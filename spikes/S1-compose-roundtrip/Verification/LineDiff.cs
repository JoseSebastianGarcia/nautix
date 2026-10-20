namespace Nautix.Spikes.S1.Verification;

/// <summary>Lines (split on '\n', terminator '\r' stays attached) that differ between two texts, found by common prefix/suffix.</summary>
internal readonly record struct LineDiff(int OriginalStart, int OriginalCount, int NewStart, int NewCount)
{
    public static LineDiff Compute(string original, string patched)
    {
        ArgumentNullException.ThrowIfNull(original);
        ArgumentNullException.ThrowIfNull(patched);
        var a = original.Split('\n');
        var b = patched.Split('\n');

        var prefix = 0;
        while (prefix < a.Length && prefix < b.Length && a[prefix] == b[prefix])
        {
            prefix++;
        }

        var suffix = 0;
        while (suffix < a.Length - prefix && suffix < b.Length - prefix && a[^(suffix + 1)] == b[^(suffix + 1)])
        {
            suffix++;
        }

        return new LineDiff(prefix, a.Length - prefix - suffix, prefix, b.Length - prefix - suffix);
    }
}
