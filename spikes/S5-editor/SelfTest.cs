using System.Collections.Immutable;
using System.Diagnostics;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using ICSharpCode.AvalonEdit.Highlighting;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S5;

/// <summary>Automated checks for S5. Gates are defined here and in the README; visual quality is confirmed from the screenshots.</summary>
internal sealed class SelfTest(MainWindow window, EditorController controller, Action<Nautix.Ui.Theming.ThemeMode> setTheme, string outputDirectory, bool screenshots)
{
    private const double TypingP95BudgetMs = 50;
    private const double AnalysisBudgetMs = 250;

    public async Task<SpikeReport> RunAsync()
    {
        var checks = ImmutableArray.CreateBuilder<CheckResult>();
        Directory.CreateDirectory(outputDirectory);

        checks.Add(await HighlightingAsync());
        checks.Add(await FoldingAsync());
        checks.Add(await SquigglesAsync());
        checks.Add(await ThemeSwitchAsync());
        checks.Add(await PerformanceAsync());

        return new SpikeReport("S5-editor", DateTimeOffset.Now, MachineInfo.Capture(), checks.ToImmutable());
    }

    private Task Idle() => window.Dispatcher.InvokeAsync(() => { }, DispatcherPriority.ContextIdle).Task;

    private async Task LoadAsync(string text)
    {
        window.TextEditor.Text = text;
        controller.AnalyzeNow();
        await Idle();
    }

    private async Task<CheckResult> HighlightingAsync()
    {
        setTheme(Nautix.Ui.Theming.ThemeMode.Dark);
        await LoadAsync("# comment line\nimage: nginx:1 # trailing\nref: *anchor\nflag: true\n");
        var document = window.TextEditor.Document;
        using var highlighter = new DocumentHighlighter(document, window.TextEditor.SyntaxHighlighting);

        bool Has(int line, string colorName, string textAtSection)
        {
            var definition = window.TextEditor.SyntaxHighlighting;
            var expected = ((SimpleHighlightingBrush)definition.GetNamedColor(colorName).Foreground!).GetBrush(null) as SolidColorBrush;
            var highlighted = highlighter.HighlightLine(line);
            return highlighted.Sections.Any(s =>
                document.GetText(s.Offset, s.Length).Contains(textAtSection, StringComparison.Ordinal)
                && s.Color.Foreground?.GetBrush(null) is SolidColorBrush brush
                && brush.Color == expected!.Color);
        }

        var key = Has(2, "Key", "image");
        var comment = Has(1, "Comment", "# comment line") && Has(2, "Comment", "# trailing");
        var alias = Has(3, "Anchor", "*anchor");
        var literal = Has(4, "Literal", "true");
        var passed = key && comment && alias && literal;
        return CheckResult.Create(
            "YAML highlighting (key, comment, alias, literal) with theme colours",
            passed,
            "all four token classes highlighted with token colours",
            passed ? string.Empty : $"key={key} comment={comment} alias={alias} literal={literal}",
            ("key", key ? 1 : 0),
            ("comment", comment ? 1 : 0),
            ("alias", alias ? 1 : 0),
            ("literal", literal ? 1 : 0));
    }

    private async Task<CheckResult> FoldingAsync()
    {
        await LoadAsync(SampleLoader.Load("valid-with-warnings.yaml"));
        var count = controller.FoldingCount;
        var textView = window.TextEditor.TextArea.TextView;
        textView.EnsureVisualLines();
        var before = textView.VisualLines.Count;

        var services = controller.Folding.AllFoldings.OrderBy(f => f.StartOffset).First(f => window.TextEditor.Document.GetText(f.StartOffset - 8, 8).Contains("services:", StringComparison.Ordinal));
        services.IsFolded = true;
        await Idle();
        textView.EnsureVisualLines();
        var after = textView.VisualLines.Count;
        services.IsFolded = false;

        var passed = count == 9 && after < before;
        return CheckResult.Create(
            "Folding by key (services fold collapses its children)",
            passed,
            "9 folds in the sample; folding 'services' reduces visible lines",
            string.Empty,
            ("folds", count),
            ("visibleLinesBefore", before),
            ("visibleLinesAfterFoldingServices", after));
    }

    private async Task<CheckResult> SquigglesAsync()
    {
        await LoadAsync(SampleLoader.Load("valid-with-warnings.yaml"));
        window.TextEditor.TextArea.TextView.EnsureVisualLines();
        window.TextEditor.TextArea.TextView.InvalidateLayer(controller.Renderer.Layer);
        await Idle();
        var warnings = controller.Diagnostics.Count(d => d.Severity == DiagnosticSeverity.Warning && d.Code == "NX-IMG001");
        var drawn = controller.Renderer.LastDrawnSegments;
        await Capture("squiggles-warnings.png");

        await LoadAsync(SampleLoader.Load("broken.yaml"));
        window.TextEditor.TextArea.TextView.EnsureVisualLines();
        window.TextEditor.TextArea.TextView.InvalidateLayer(controller.Renderer.Layer);
        await Idle();
        var errors = controller.Diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).ToList();
        var errorLine = errors.Count == 1 ? window.TextEditor.Document.GetLineByOffset(errors[0].Offset).LineNumber : -1;
        var drawnError = controller.Renderer.LastDrawnSegments;
        await Capture("squiggles-error.png");

        var passed = warnings == 2 && drawn >= 2 && errors.Count == 1 && errorLine is 4 or 5 && drawnError >= 1;
        return CheckResult.Create(
            "Diagnostic squiggles (2 warnings; 1 syntax error on the broken line)",
            passed,
            "expected counts and segments actually drawn",
            $"syntax error reported on line {errorLine}",
            ("warnings", warnings),
            ("segmentsDrawnWarnings", drawn),
            ("errors", errors.Count),
            ("segmentsDrawnError", drawnError));
    }

    private async Task<CheckResult> ThemeSwitchAsync()
    {
        await LoadAsync(SampleLoader.Load("valid-with-warnings.yaml"));
        setTheme(Nautix.Ui.Theming.ThemeMode.Dark);
        await Idle();
        var darkBackground = (window.TextEditor.Background as SolidColorBrush)?.Color;
        var darkKey = TokenOf("Key");
        await Capture("theme-dark.png");

        setTheme(Nautix.Ui.Theming.ThemeMode.Light);
        await Idle();
        var lightBackground = (window.TextEditor.Background as SolidColorBrush)?.Color;
        var lightKey = TokenOf("Key");
        await Capture("theme-light.png");

        var passed = darkBackground is not null && lightBackground is not null && darkBackground != lightBackground && darkKey != lightKey;
        return CheckResult.Create(
            "Dark/light switch recolours editor background and highlighting at runtime",
            passed,
            "background and key colour both change",
            $"dark bg={darkBackground} light bg={lightBackground} dark key={darkKey} light key={lightKey}");
    }

    private Color? TokenOf(string name) =>
        ((SimpleHighlightingBrush?)window.TextEditor.SyntaxHighlighting.GetNamedColor(name).Foreground)?.GetBrush(null) is SolidColorBrush brush ? brush.Color : null;

    private async Task<CheckResult> PerformanceAsync()
    {
        setTheme(Nautix.Ui.Theming.ThemeMode.Dark);
        var big = SampleLoader.BigDocument(5000);

        var sw = Stopwatch.StartNew();
        window.TextEditor.Text = big;
        window.TextEditor.TextArea.TextView.EnsureVisualLines();
        await Idle();
        var loadMs = sw.Elapsed.TotalMilliseconds;

        sw.Restart();
        controller.AnalyzeNow();
        var analysisMs = sw.Elapsed.TotalMilliseconds;

        var document = window.TextEditor.Document;
        var middle = document.GetLineByNumber(2500).EndOffset;
        var samples = new List<double>();
        for (var i = 0; i < 40; i++)
        {
            sw.Restart();
            document.Insert(middle + i, "x");
            await Idle();
            samples.Add(sw.Elapsed.TotalMilliseconds);
        }

        sw.Restart();
        window.TextEditor.ScrollToLine(4500);
        await Idle();
        var scrollMs = sw.Elapsed.TotalMilliseconds;

        var p95 = samples.Order().ElementAt((int)Math.Floor(samples.Count * 0.95) - 1);
        var lines = document.LineCount;
        var passed = p95 <= TypingP95BudgetMs && analysisMs <= AnalysisBudgetMs;
        return CheckResult.Create(
            $"Performance on a {lines}-line file",
            passed,
            $"typing p95 <= {TypingP95BudgetMs} ms and analysis <= {AnalysisBudgetMs} ms",
            "Analysis runs on the UI thread in this spike; production would run it off-thread.",
            ("lines", lines),
            ("loadMs", loadMs),
            ("analysisMs", analysisMs),
            ("typingP95Ms", p95),
            ("typingMaxMs", samples.Max()),
            ("scrollToLine4500Ms", scrollMs));
    }

    private async Task Capture(string fileName)
    {
        if (!screenshots)
        {
            return;
        }

        await Idle();
        var bitmap = new RenderTargetBitmap((int)window.ActualWidth, (int)window.ActualHeight, 96, 96, PixelFormats.Pbgra32);
        bitmap.Render(window);
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(bitmap));
        await using var stream = File.Create(Path.Combine(outputDirectory, fileName));
        encoder.Save(stream);
    }
}
