using Nautix.SharedKernel;
using Nautix.Spikes.S1.Yaml;

namespace Nautix.Spikes.S1.Editing;

/// <summary>Shape of the port in docs/spec/04-editors.md, with Result for expected failures.</summary>
internal interface IYamlDocumentStore
{
    Result<YamlSyntaxTree> Parse(string text);

    Result<TextPatch> ToPatch(YamlSyntaxTree tree, ComposeEdit edit);

    string Apply(string text, TextPatch patch);
}
