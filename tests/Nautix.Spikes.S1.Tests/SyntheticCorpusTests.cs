using Nautix.Spikes.S1.Editing;
using Nautix.Spikes.S1.Verification;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.Spikes.S1.Tests;

public sealed class SyntheticCorpusTests
{
    public static TheoryData<string> Files()
    {
        var data = new TheoryData<string>();
        foreach (var file in Directory.EnumerateFiles(RepositoryLocator.Resolve("corpus", "compose", "synthetic"), "*.yaml").Order(StringComparer.Ordinal))
        {
            data.Add(Path.GetFileName(file));
        }

        return data;
    }

    [Theory]
    [MemberData(nameof(Files))]
    public void Every_synthetic_edge_case_round_trips_and_edits_cleanly(string name)
    {
        var bytes = File.ReadAllBytes(RepositoryLocator.Resolve("corpus", "compose", "synthetic", name));

        var report = RoundTripRunner.Run(new YamlDocumentStore(), name, "synthetic", bytes);

        report.Problems().ShouldBeEmpty();
        report.Edits.ShouldNotBeEmpty();
    }

    [Fact]
    public void Synthetic_corpus_exercises_the_awkward_encodings()
    {
        var dir = RepositoryLocator.Resolve("corpus", "compose", "synthetic");

        File.ReadAllBytes(Path.Combine(dir, "bom.yaml")).Take(3).ShouldBe([0xEF, 0xBB, 0xBF]);
        File.ReadAllText(Path.Combine(dir, "crlf.yaml")).ShouldContain("\r\n");
        File.ReadAllText(Path.Combine(dir, "no-trailing-newline.yaml")).ShouldNotEndWith("\n");
        File.ReadAllText(Path.Combine(dir, "mixed-eol.yaml")).ShouldContain("\r\n");
        File.ReadAllText(Path.Combine(dir, "tabs.yaml")).ShouldContain('\t');
    }

    [Fact]
    public void Invalid_utf8_is_reported_not_silently_replaced()
    {
        var report = RoundTripRunner.Run(new YamlDocumentStore(), "bad", "synthetic", [0x61, 0x3A, 0x20, 0xFF, 0x0A]);

        report.Passed.ShouldBeFalse();
        report.ParseError.ShouldBe("not valid UTF-8");
    }
}
