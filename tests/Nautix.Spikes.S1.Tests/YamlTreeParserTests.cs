using Nautix.Spikes.S1.Yaml;
using Shouldly;

namespace Nautix.Spikes.S1.Tests;

public sealed class YamlTreeParserTests
{
    private static YamlSyntaxTree Parse(string text) => YamlTreeParser.Parse(text).Value;

    private static string Slice(string text, YamlNode node) => text[node.Start..node.End];

    [Fact]
    public void Scalar_spans_cover_exactly_the_value_without_trailing_space_or_comment()
    {
        const string Text = "a: plain text   # c\nb: 'q'   # c\nc: \"z\"\n";
        var root = (YamlMapping)Parse(Text).Root!;

        Slice(Text, root.Entries[0].Value).ShouldBe("plain text");
        Slice(Text, root.Entries[1].Value).ShouldBe("'q'");
        Slice(Text, root.Entries[2].Value).ShouldBe("\"z\"");
    }

    [Fact]
    public void Anchor_and_tag_properties_are_not_part_of_the_value_span()
    {
        const string Text = "a: &x value\nb: !!str other\nc: &y !!str both\n";
        var root = (YamlMapping)Parse(Text).Root!;

        Slice(Text, root.Entries[0].Value).ShouldBe("value");
        ((YamlScalar)root.Entries[0].Value).Anchor.ShouldBe("x");
        Slice(Text, root.Entries[1].Value).ShouldBe("other");
        Slice(Text, root.Entries[2].Value).ShouldBe("both");
    }

    [Fact]
    public void Offsets_count_utf16_units_so_emoji_and_crlf_do_not_shift_spans()
    {
        const string Text = "a: \"😀x\"\r\nb: plain😀\r\nc: 1\r\n";
        var root = (YamlMapping)Parse(Text).Root!;

        Slice(Text, root.Entries[0].Value).ShouldBe("\"😀x\"");
        Slice(Text, root.Entries[1].Value).ShouldBe("plain😀");
        Slice(Text, root.Entries[2].Value).ShouldBe("1");
    }

    [Fact]
    public void Bom_is_kept_in_the_text_and_marks_are_shifted_past_it()
    {
        const string Text = "\uFEFFa: 1\n";
        var tree = Parse(Text);
        var root = (YamlMapping)tree.Root!;

        tree.HasBom.ShouldBeTrue();
        Slice(Text, root.Entries[0].Key).ShouldBe("a");
        Slice(Text, root.Entries[0].Value).ShouldBe("1");
    }

    [Fact]
    public void Flow_collections_span_from_open_to_close_bracket()
    {
        const string Text = "a: {x: 1, y: [1, 2]}\nb: [p, q]\n";
        var root = (YamlMapping)Parse(Text).Root!;

        Slice(Text, root.Entries[0].Value).ShouldBe("{x: 1, y: [1, 2]}");
        Slice(Text, root.Entries[1].Value).ShouldBe("[p, q]");
    }

    [Fact]
    public void Block_collection_end_is_the_last_content_not_the_next_token()
    {
        const string Text = "a:\n  b: 1\n  c:\n    - x\n    - y # tail\n\n\nz: 0\n";
        var root = (YamlMapping)Parse(Text).Root!;

        Slice(Text, root.Entries[0].Value).ShouldBe("b: 1\n  c:\n    - x\n    - y");
    }

    [Fact]
    public void Block_scalar_span_starts_at_its_header()
    {
        const string Text = "a: |\n  one\n  two\nb: 1\n";
        var scalar = (YamlScalar)((YamlMapping)Parse(Text).Root!).Entries[0].Value;

        scalar.Style.ShouldBe(YamlScalarStyle.Literal);
        Slice(Text, scalar).ShouldStartWith("|\n  one\n  two");
    }

    [Fact]
    public void Aliases_and_merge_keys_are_kept_as_nodes()
    {
        const string Text = "x: &d\n  k: 1\ny:\n  <<: *d\n";
        var y = (YamlMapping)((YamlMapping)Parse(Text).Root!).Entries[1].Value;

        y.Entries[0].KeyText.ShouldBe("<<");
        Slice(Text, y.Entries[0].Value).ShouldBe("*d");
        y.Entries[0].Value.ShouldBeOfType<YamlAlias>();
    }

    [Fact]
    public void Empty_values_are_zero_width_scalars()
    {
        var root = (YamlMapping)Parse("a:\nb: 1\n").Root!;

        ((YamlScalar)root.Entries[0].Value).IsEmpty.ShouldBeTrue();
        root.Entries[0].Value.Start.ShouldBe(root.Entries[0].Value.End);
    }

    [Fact]
    public void Multiple_documents_are_all_parsed()
    {
        var tree = Parse("---\na: 1\n...\n---\nb: 2\n");

        tree.Documents.Length.ShouldBe(2);
    }

    [Fact]
    public void Syntax_error_is_a_validation_failure_not_an_exception()
    {
        var result = YamlTreeParser.Parse("a: [unclosed\n");

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("yaml.syntax");
    }
}
