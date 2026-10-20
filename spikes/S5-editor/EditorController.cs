using System.Collections.Immutable;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit;
using ICSharpCode.AvalonEdit.Folding;

namespace Nautix.Spikes.S5;

/// <summary>Wires highlighting, squiggles and folding to a <see cref="TextEditor"/> with the 250 ms re-analysis debounce of the spec.</summary>
internal sealed class EditorController : IDisposable
{
    private readonly TextEditor _editor;
    private readonly DiagnosticRenderer _renderer;
    private readonly FoldingManager _folding;
    private readonly DispatcherTimer _debounce;

    public EditorController(TextEditor editor)
    {
        _editor = editor;
        _renderer = new DiagnosticRenderer(SeverityBrush);
        _editor.TextArea.TextView.BackgroundRenderers.Add(_renderer);
        _folding = FoldingManager.Install(_editor.TextArea);

        _debounce = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(250) };
        _debounce.Tick += (_, _) =>
        {
            _debounce.Stop();
            AnalyzeNow();
        };
        _editor.Document.TextChanged += (_, _) =>
        {
            _debounce.Stop();
            _debounce.Start();
        };
        _editor.TextArea.TextView.MouseHover += OnHover;
        _editor.TextArea.TextView.MouseHoverStopped += (_, _) => _editor.ToolTip = null;
        ApplyTheme();
    }

    public int FoldingCount => _folding.AllFoldings.Count();

    public DiagnosticRenderer Renderer => _renderer;

    public ImmutableArray<EditorDiagnostic> Diagnostics => _renderer.Diagnostics;

    public FoldingManager Folding => _folding;

    /// <summary>Synchronous analysis (the production editor would run the parse off the UI thread).</summary>
    public void AnalyzeNow()
    {
        _renderer.SetDiagnostics(YamlDiagnostics.Analyze(_editor.Text));
        YamlFoldingStrategy.Update(_folding, _editor.Document);
        _editor.TextArea.TextView.InvalidateLayer(_renderer.Layer);
    }

    public void ApplyTheme()
    {
        _editor.SyntaxHighlighting = new YamlHighlightingDefinition(Token);
        _editor.TextArea.TextView.InvalidateLayer(_renderer.Layer);
    }

    public static Color Token(string name) => (Color)Application.Current.FindResource(name + ".Color");

    public void Dispose()
    {
        _debounce.Stop();
        _editor.TextArea.TextView.BackgroundRenderers.Remove(_renderer);
        FoldingManager.Uninstall(_folding);
    }

    private static SolidColorBrush SeverityBrush(DiagnosticSeverity severity)
    {
        var token = severity == DiagnosticSeverity.Error ? "Nx.Danger" : "Nx.Amber";
        return new SolidColorBrush(Token(token));
    }

    private void OnHover(object sender, MouseEventArgs e)
    {
        var position = _editor.GetPositionFromPoint(e.GetPosition(_editor));
        if (position is { } p && _renderer.At(_editor.Document.GetOffset(p.Location)) is { } diagnostic)
        {
            _editor.ToolTip = $"{diagnostic.Code}: {diagnostic.Message}";
        }
    }
}
