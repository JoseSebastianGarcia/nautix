using System.Globalization;
using System.Text;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Editing;

/// <summary>Renders a string as a YAML scalar, keeping the style of the scalar it replaces when that is possible.</summary>
internal static class YamlScalarFormatter
{
    private static readonly HashSet<string> _reservedWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "true", "false", "yes", "no", "on", "off", "y", "n", "null", "~",
    };

    public static string Format(string value, YamlScalarStyle preferred)
    {
        ArgumentNullException.ThrowIfNull(value);
        if (HasControlCharacters(value))
        {
            return DoubleQuoted(value);
        }

        return preferred switch
        {
            YamlScalarStyle.DoubleQuoted => DoubleQuoted(value),
            YamlScalarStyle.SingleQuoted => SingleQuoted(value),
            _ => IsPlainSafe(value) ? value : SingleQuoted(value),
        };
    }

    public static string FormatKey(string key) => IsPlainSafe(key) ? key : SingleQuoted(key);

    private static string SingleQuoted(string value) => "'" + value.Replace("'", "''", StringComparison.Ordinal) + "'";

    private static string DoubleQuoted(string value)
    {
        var sb = new StringBuilder("\"");
        foreach (var c in value)
        {
            sb.Append(c switch
            {
                '"' => "\\\"",
                '\\' => "\\\\",
                '\n' => "\\n",
                '\r' => "\\r",
                '\t' => "\\t",
                _ when char.IsControl(c) => string.Create(CultureInfo.InvariantCulture, $"\\x{(int)c:X2}"),
                _ => c.ToString(),
            });
        }

        return sb.Append('"').ToString();
    }

    private static bool HasControlCharacters(string value) => value.Any(c => char.IsControl(c));

    private static bool IsPlainSafe(string value)
    {
        if (value.Length == 0 || char.IsWhiteSpace(value[0]) || char.IsWhiteSpace(value[^1]))
        {
            return false;
        }

        if ("-?:,[]{}#&*!|>'\"%@`".Contains(value[0], StringComparison.Ordinal))
        {
            return false;
        }

        if (value.Contains(": ", StringComparison.Ordinal) || value.Contains(" #", StringComparison.Ordinal) || value[^1] == ':')
        {
            return false;
        }

        return !_reservedWords.Contains(value) && !double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _);
    }
}
