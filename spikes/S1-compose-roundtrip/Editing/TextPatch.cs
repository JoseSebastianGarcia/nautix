namespace Nautix.Spikes.S1.Editing;

/// <summary>Replace <see cref="Length"/> characters at <see cref="Start"/> with <see cref="Replacement"/>.</summary>
internal readonly record struct TextPatch(int Start, int Length, string Replacement)
{
    public static TextPatch None => new(0, 0, string.Empty);

    public string Apply(string text)
    {
        ArgumentNullException.ThrowIfNull(text);
        return string.Concat(text.AsSpan(0, Start), Replacement, text.AsSpan(Start + Length));
    }
}
