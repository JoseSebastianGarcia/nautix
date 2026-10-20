using System.Text.RegularExpressions;
using System.Windows.Media;
using ICSharpCode.AvalonEdit.Highlighting;

namespace Nautix.Spikes.S5;

/// <summary>
/// YAML highlighting built in code so every colour is resolved from the active theme tokens
/// (an XSHD file would need hex literals). Rebuild it when the theme changes.
/// </summary>
internal sealed class YamlHighlightingDefinition : IHighlightingDefinition
{
    private readonly Dictionary<string, HighlightingColor> _colors;

    public YamlHighlightingDefinition(Func<string, Color> token)
    {
        ArgumentNullException.ThrowIfNull(token);
        _colors = new Dictionary<string, HighlightingColor>(StringComparer.Ordinal)
        {
            ["Key"] = Make(token("Nx.Cyan")),
            ["String"] = Make(token("Nx.LimeStrong")),
            ["Comment"] = Make(token("Nx.TextDim"), italic: true),
            ["Anchor"] = Make(token("Nx.Violet")),
            ["Literal"] = Make(token("Nx.Amber")),
            ["Punctuation"] = Make(token("Nx.TextDim")),
        };

        MainRuleSet = BuildRules();
    }

    public string Name => "YAML";

    public HighlightingRuleSet MainRuleSet { get; }

    public IEnumerable<HighlightingColor> NamedHighlightingColors => _colors.Values;

    public IDictionary<string, string> Properties { get; } = new Dictionary<string, string>();

    public HighlightingColor GetNamedColor(string name) => _colors[name];

    public HighlightingRuleSet? GetNamedRuleSet(string name) => name.Length == 0 ? MainRuleSet : null;

    private static HighlightingColor Make(Color color, bool italic = false) => new()
    {
        Foreground = new SimpleHighlightingBrush(color),
        FontStyle = italic ? System.Windows.FontStyles.Italic : null,
    };

    private HighlightingRuleSet BuildRules()
    {
        const RegexOptions Options = RegexOptions.CultureInvariant;
        var rules = new HighlightingRuleSet { Name = "YAML" };

        rules.Spans.Add(new HighlightingSpan
        {
            StartExpression = new Regex(@"(?<=^|\s)#", Options),
            EndExpression = new Regex("$", Options),
            SpanColor = _colors["Comment"],
        });
        rules.Spans.Add(new HighlightingSpan
        {
            StartExpression = new Regex("\"", Options),
            EndExpression = new Regex("\"|$", Options),
            SpanColor = _colors["String"],
            RuleSet = EscapeRules(),
        });
        rules.Spans.Add(new HighlightingSpan
        {
            StartExpression = new Regex("'", Options),
            EndExpression = new Regex("'|$", Options),
            SpanColor = _colors["String"],
        });

        rules.Rules.Add(new HighlightingRule { Regex = new Regex(@"^(---|\.\.\.)\s*$", RegexOptions.Multiline | Options), Color = _colors["Punctuation"] });
        rules.Rules.Add(new HighlightingRule { Regex = new Regex(@"^\s*(?:-\s+)*[\w.\-/$]+(?=\s*:(?:\s|$))", RegexOptions.Multiline | Options), Color = _colors["Key"] });
        rules.Rules.Add(new HighlightingRule { Regex = new Regex(@"[&*][\w\-]+|<<(?=\s*:)|!\S*", Options), Color = _colors["Anchor"] });
        rules.Rules.Add(new HighlightingRule { Regex = new Regex(@"(?<![\w.])(?:true|false|yes|no|on|off|null|~)(?![\w.])|(?<![\w.:/-])\d+(?:\.\d+)?(?![\w.])", RegexOptions.IgnoreCase | Options), Color = _colors["Literal"] });
        rules.Rules.Add(new HighlightingRule { Regex = new Regex(@"^\s*-(?=\s)|[\[\]{},|>]", RegexOptions.Multiline | Options), Color = _colors["Punctuation"] });
        return rules;
    }

    private HighlightingRuleSet EscapeRules()
    {
        var escapes = new HighlightingRuleSet { Name = "Escapes" };
        escapes.Rules.Add(new HighlightingRule { Regex = new Regex(@"\\.", RegexOptions.CultureInvariant), Color = _colors["Anchor"] });
        return escapes;
    }
}
