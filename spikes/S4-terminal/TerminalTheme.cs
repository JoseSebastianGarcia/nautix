using System.Windows;
using System.Windows.Media;

namespace Nautix.Spikes.S4;

/// <summary>Builds the xterm.js theme object from the Nx.* tokens; no colour literals here.</summary>
internal static class TerminalTheme
{
    public static Dictionary<string, string> FromTokens()
    {
        static string Hex(string token)
        {
            var color = (Color)Application.Current.FindResource(token + ".Color");
            return $"#{color.R:X2}{color.G:X2}{color.B:X2}";
        }

        return new Dictionary<string, string>
        {
            ["background"] = Hex("Nx.Bg1"),
            ["foreground"] = Hex("Nx.Text"),
            ["cursor"] = Hex("Nx.LimeStrong"),
            ["cursorAccent"] = Hex("Nx.Bg1"),
            ["selectionBackground"] = Hex("Nx.LineStrong"),
            ["black"] = Hex("Nx.Bg2"),
            ["red"] = Hex("Nx.Danger"),
            ["green"] = Hex("Nx.LimeStrong"),
            ["yellow"] = Hex("Nx.Amber"),
            ["blue"] = Hex("Nx.Cyan"),
            ["magenta"] = Hex("Nx.Violet"),
            ["cyan"] = Hex("Nx.Cyan"),
            ["white"] = Hex("Nx.Text"),
            ["brightBlack"] = Hex("Nx.TextDim"),
            ["brightRed"] = Hex("Nx.Danger"),
            ["brightGreen"] = Hex("Nx.Lime"),
            ["brightYellow"] = Hex("Nx.Amber"),
            ["brightBlue"] = Hex("Nx.Cyan"),
            ["brightMagenta"] = Hex("Nx.Violet"),
            ["brightCyan"] = Hex("Nx.Cyan"),
            ["brightWhite"] = Hex("Nx.Text"),
        };
    }
}
