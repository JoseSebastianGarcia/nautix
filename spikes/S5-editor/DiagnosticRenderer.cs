using System.Collections.Immutable;
using System.Windows;
using System.Windows.Media;
using ICSharpCode.AvalonEdit.Document;
using ICSharpCode.AvalonEdit.Rendering;

namespace Nautix.Spikes.S5;

/// <summary>Draws wavy underlines under diagnostic ranges. Colours come from theme brushes, never literals.</summary>
internal sealed class DiagnosticRenderer(Func<DiagnosticSeverity, Brush> brushFor) : IBackgroundRenderer
{
    private ImmutableArray<EditorDiagnostic> _diagnostics = [];

    public KnownLayer Layer => KnownLayer.Selection;

    /// <summary>How many squiggle segments the last render produced (lets the self-test prove they are drawn).</summary>
    public int LastDrawnSegments { get; private set; }

    public ImmutableArray<EditorDiagnostic> Diagnostics => _diagnostics;

    public void SetDiagnostics(ImmutableArray<EditorDiagnostic> diagnostics) => _diagnostics = diagnostics;

    public EditorDiagnostic? At(int offset) => _diagnostics.FirstOrDefault(d => offset >= d.Offset && offset <= d.Offset + d.Length);

    public void Draw(TextView textView, DrawingContext drawingContext)
    {
        ArgumentNullException.ThrowIfNull(textView);
        ArgumentNullException.ThrowIfNull(drawingContext);
        var drawn = 0;
        if (textView.Document is not null && textView.VisualLinesValid)
        {
            foreach (var diagnostic in _diagnostics)
            {
                var segment = new TextSegment { StartOffset = diagnostic.Offset, Length = diagnostic.Length };
                var pen = new Pen(brushFor(diagnostic.Severity), 1);
                pen.Freeze();
                foreach (var rect in BackgroundGeometryBuilder.GetRectsForSegment(textView, segment))
                {
                    drawingContext.DrawGeometry(null, pen, Squiggle(rect));
                    drawn++;
                }
            }
        }

        LastDrawnSegments = drawn;
    }

    private static StreamGeometry Squiggle(Rect rect)
    {
        const double Step = 3;
        var geometry = new StreamGeometry();
        using (var context = geometry.Open())
        {
            var y = rect.Bottom - 1;
            context.BeginFigure(new Point(rect.Left, y), isFilled: false, isClosed: false);
            var up = true;
            for (var x = rect.Left + Step; x <= rect.Right + Step; x += Step)
            {
                context.LineTo(new Point(Math.Min(x, rect.Right), up ? y - 2 : y), isStroked: true, isSmoothJoin: false);
                up = !up;
            }
        }

        geometry.Freeze();
        return geometry;
    }
}
