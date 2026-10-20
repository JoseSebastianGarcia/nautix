using System.Globalization;

namespace Nautix.Ui.Theming;

/// <summary>WCAG 2.x relative luminance and contrast ratio for <c>#RRGGBB</c> colors.</summary>
public static class Wcag
{
    public const double NormalTextRatio = 4.5;

    public const double NonTextRatio = 3.0;

    public static double ContrastRatio(string foregroundHex, string backgroundHex)
    {
        var a = RelativeLuminance(foregroundHex);
        var b = RelativeLuminance(backgroundHex);
        var (lighter, darker) = a >= b ? (a, b) : (b, a);
        return (lighter + 0.05) / (darker + 0.05);
    }

    public static double RelativeLuminance(string hex)
    {
        ArgumentNullException.ThrowIfNull(hex);
        var digits = hex.TrimStart('#');
        if (digits.Length != 6)
        {
            throw new FormatException($"Expected #RRGGBB, got '{hex}'.");
        }

        double Channel(int offset)
        {
            var value = int.Parse(digits.AsSpan(offset, 2), NumberStyles.HexNumber, CultureInfo.InvariantCulture) / 255.0;
            return value <= 0.03928 ? value / 12.92 : Math.Pow((value + 0.055) / 1.055, 2.4);
        }

        return (0.2126 * Channel(0)) + (0.7152 * Channel(2)) + (0.0722 * Channel(4));
    }
}
