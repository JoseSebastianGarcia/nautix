namespace Nautix.Spikes.S4;

/// <summary>Snapshot of the xterm.js buffer (what the user actually sees), used by the self-test instead of OCR.</summary>
internal sealed record TerminalDump(
    IReadOnlyList<string> Lines,
    string BufferType,
    int Columns,
    int Rows,
    int ViewportY,
    string? Background,
    string Renderer)
{
    public bool IsAlternateScreen => BufferType == "alternate";

    public IEnumerable<string> VisibleLines => Lines.Skip(ViewportY).Take(Rows);

    public bool Contains(string text) => Lines.Any(l => l.Contains(text, StringComparison.Ordinal));

    public bool HasLine(string exact) => Lines.Any(l => l.Trim() == exact);
}
