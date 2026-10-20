using System.Xml.Linq;
using Nautix.TestKit;

namespace Nautix.Ui.Tests.Resources;

internal static class ResxFile
{
    public static IReadOnlyDictionary<string, string> Load(string fileName) =>
        XDocument.Load(RepositoryLocator.Resolve("src", "Nautix.Ui", "Resources", fileName))
            .Root!.Elements("data")
            .ToDictionary(
                d => d.Attribute("name")!.Value,
                d => d.Element("value")!.Value,
                StringComparer.Ordinal);
}
