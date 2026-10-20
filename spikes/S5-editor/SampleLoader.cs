using System.Reflection;
using System.Text;

namespace Nautix.Spikes.S5;

internal static class SampleLoader
{
    public static string Load(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resource = assembly.GetManifestResourceNames().Single(n => n.EndsWith(name, StringComparison.Ordinal));
        using var reader = new StreamReader(assembly.GetManifestResourceStream(resource)!);
        return reader.ReadToEnd();
    }

    /// <summary>A realistic compose file of about <paramref name="lines"/> lines made of repeated service blocks.</summary>
    public static string BigDocument(int lines)
    {
        var sb = new StringBuilder("services:\n");
        const int LinesPerBlock = 13;
        for (var i = 0; i < Math.Max(1, (lines - 1) / LinesPerBlock); i++)
        {
            sb.Append(System.Globalization.CultureInfo.InvariantCulture, $"  svc{i}:\n    image: app{i}:1.0\n    restart: always # keep up\n    ports:\n      - \"{8000 + (i % 1000)}:80\"\n    environment:\n      A: \"1\"\n      B: two\n    healthcheck:\n      test: [\"CMD\", \"true\"]\n      interval: 5s\n    labels:\n      team: core\n");
        }

        return sb.ToString();
    }
}
