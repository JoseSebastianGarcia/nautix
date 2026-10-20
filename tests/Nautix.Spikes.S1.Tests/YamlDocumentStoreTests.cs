using Nautix.Spikes.S1.Editing;
using Shouldly;

namespace Nautix.Spikes.S1.Tests;

public sealed class YamlDocumentStoreTests
{
    private readonly YamlDocumentStore _store = new();

    private string Edit(string text, ComposeEdit edit)
    {
        var tree = _store.Parse(text).Value;
        return _store.Apply(text, _store.ToPatch(tree, edit).Value);
    }

    private string Code(string text, ComposeEdit edit) => _store.ToPatch(_store.Parse(text).Value, edit).Error.Code;

    private static YamlPath P(params string[] segments) => new([.. segments]);

    [Fact]
    public void No_op_patch_changes_nothing()
    {
        const string Text = "# c\na: 1 # x\n\nb:\r\n  - 2\n";

        Edit(Text, new NoOp()).ShouldBe(Text);
    }

    [Fact]
    public void SetScalar_replaces_only_the_value_and_keeps_the_trailing_comment()
    {
        Edit("a: 1\nb: two # c\n", new SetScalar(P("b"), "new")).ShouldBe("a: 1\nb: new # c\n");
    }

    [Fact]
    public void SetScalar_keeps_quote_style_and_escapes()
    {
        Edit("a: 'x'\n", new SetScalar(P("a"), "it's")).ShouldBe("a: 'it''s'\n");
        Edit("a: \"x\"\n", new SetScalar(P("a"), "say \"hi\"")).ShouldBe("a: \"say \\\"hi\\\"\"\n");
    }

    [Fact]
    public void SetScalar_quotes_plain_values_that_would_change_meaning()
    {
        Edit("a: x\n", new SetScalar(P("a"), "true")).ShouldBe("a: 'true'\n");
        Edit("a: x\n", new SetScalar(P("a"), "a: b")).ShouldBe("a: 'a: b'\n");
        Edit("a: x\n", new SetScalar(P("a"), "8080")).ShouldBe("a: '8080'\n");
    }

    [Fact]
    public void SetScalar_keeps_the_anchor_so_aliases_still_resolve()
    {
        Edit("a: &z old\nb: *z\n", new SetScalar(P("a"), "new")).ShouldBe("a: &z new\nb: *z\n");
    }

    [Fact]
    public void SetScalar_inside_a_flow_collection_touches_only_that_item()
    {
        Edit("a: {x: 1, y: [p, q]}\n", new SetScalar(P("a", "y", "[1]"), "z")).ShouldBe("a: {x: 1, y: [p, z]}\n");
    }

    [Fact]
    public void AddKey_appends_with_the_mappings_indentation()
    {
        Edit("s:\n  a: 1\n  b: 2\nt: 0\n", new AddKey(P("s"), "k", "v")).ShouldBe("s:\n  a: 1\n  b: 2\n  k: v\nt: 0\n");
    }

    [Fact]
    public void AddKey_goes_after_the_whole_nested_value_of_the_last_entry()
    {
        Edit("s:\n  a:\n    x: 1\n    y: 2\n  b: 3\n", new AddKey(P("s", "a"), "k", "v"))
            .ShouldBe("s:\n  a:\n    x: 1\n    y: 2\n    k: v\n  b: 3\n");
    }

    [Fact]
    public void AddKey_goes_below_a_trailing_comment_of_the_last_entry()
    {
        Edit("s:\n  a: 1 # c\nz: 0\n", new AddKey(P("s"), "k", "v")).ShouldBe("s:\n  a: 1 # c\n  k: v\nz: 0\n");
    }

    [Fact]
    public void AddKey_uses_crlf_when_the_file_does()
    {
        Edit("s:\r\n  a: 1\r\n", new AddKey(P("s"), "k", "v")).ShouldBe("s:\r\n  a: 1\r\n  k: v\r\n");
    }

    [Fact]
    public void AddKey_uses_the_terminator_of_the_neighbouring_line_in_mixed_files()
    {
        Edit("s:\n  a: 1\r\n  b: 2\n", new AddKey(P("s"), "k", "v")).ShouldBe("s:\n  a: 1\r\n  b: 2\n  k: v\n");
        Edit("s:\n  a: 1\r\n", new AddKey(P("s"), "k", "v")).ShouldBe("s:\n  a: 1\r\n  k: v\r\n");
    }

    [Fact]
    public void AddKey_at_end_of_file_without_final_newline_keeps_that_shape()
    {
        Edit("s:\n  a: 1", new AddKey(P("s"), "k", "v")).ShouldBe("s:\n  a: 1\n  k: v");
    }

    [Fact]
    public void AddKey_ignores_the_bom_when_computing_indentation_and_keeps_it()
    {
        Edit("\uFEFFa: 1\n", new AddKey(YamlPath.Root, "b", "x")).ShouldBe("\uFEFFa: 1\nb: x\n");
    }

    [Fact]
    public void AddKey_on_a_mapping_that_is_a_sequence_item_aligns_with_the_first_key()
    {
        Edit("s:\n  - name: a\n    v: 1\n", new AddKey(P("s", "[0]"), "k", "x")).ShouldBe("s:\n  - name: a\n    v: 1\n    k: x\n");
        Edit("s:\n  - name: a\n", new AddKey(P("s", "[0]"), "k", "x")).ShouldBe("s:\n  - name: a\n    k: x\n");
    }

    [Fact]
    public void AddKey_handles_non_default_indentation_widths()
    {
        Edit("a:\n    b:\n        c: 1\n", new AddKey(P("a", "b"), "k", "v")).ShouldBe("a:\n    b:\n        c: 1\n        k: v\n");
    }

    [Fact]
    public void AddKey_after_a_literal_block_keeps_its_trailing_blank_lines_inside_the_block()
    {
        Edit("a:\n  t: |+\n    x\n\n  u: 1\n", new AddKey(P("a"), "k", "v")).ShouldBe("a:\n  t: |+\n    x\n\n  u: 1\n  k: v\n");
        Edit("a:\n  t: |+\n    x\n\n", new AddKey(P("a"), "k", "v")).ShouldBe("a:\n  t: |+\n    x\n\n  k: v\n");
    }

    [Fact]
    public void AppendItem_supports_indentless_sequences()
    {
        Edit("s:\n- a\n- b\nt: 1\n", new AppendItem(P("s"), "v")).ShouldBe("s:\n- a\n- b\n- v\nt: 1\n");
    }

    [Fact]
    public void AppendItem_after_a_sequence_of_mappings_goes_below_the_last_items_children()
    {
        Edit("s:\n  - n: a\n    m: 1\n  - n: b\n    m: 2\nt: 1\n", new AppendItem(P("s"), "v"))
            .ShouldBe("s:\n  - n: a\n    m: 1\n  - n: b\n    m: 2\n  - v\nt: 1\n");
    }

    [Fact]
    public void RemoveKey_removes_the_key_its_nested_value_and_trailing_comment_only()
    {
        Edit("a: 1\nb: # note\n  c: 2\n  d: 3\ne: 4\n", new RemoveKey(P("b"))).ShouldBe("a: 1\ne: 4\n");
    }

    [Fact]
    public void RemoveKey_keeps_comments_that_sit_on_their_own_lines()
    {
        Edit("a: 1\n# about b\nb: 2\n# about c\nc: 3\n", new RemoveKey(P("b"))).ShouldBe("a: 1\n# about b\n# about c\nc: 3\n");
    }

    [Theory]
    [InlineData("a: 1\nb: 2", "a: 1")]
    [InlineData("a: 1\r\nb: 2", "a: 1")]
    public void RemoveKey_at_the_end_of_a_file_without_final_newline_keeps_that_shape(string text, string expected)
    {
        Edit(text, new RemoveKey(P("b"))).ShouldBe(expected);
    }

    [Theory]
    [InlineData("s:\n  a: 1\n", "edit.not_applicable.only_entry")]
    public void RemoveKey_refuses_to_leave_an_empty_mapping(string text, string code)
    {
        Code(text, new RemoveKey(P("s", "a"))).ShouldBe(code);
    }

    [Fact]
    public void RemoveKey_refuses_a_first_key_that_shares_its_line_with_a_dash()
    {
        Code("s:\n  - n: a\n    m: 1\n", new RemoveKey(P("s", "[0]", "n"))).ShouldBe("edit.not_applicable.shares_line");
    }

    [Theory]
    [InlineData("a: &x v\nb: *x\n", "b", "edit.not_applicable.alias")]
    [InlineData("a: |\n  x\n", "a", "edit.not_applicable.block_scalar")]
    [InlineData("a:\nb: 1\n", "a", "edit.not_applicable.empty_value")]
    [InlineData("a: \"x\n  y\"\n", "a", "edit.not_applicable.multiline_scalar")]
    [InlineData("a:\n  b: 1\n", "a", "edit.not_applicable.not_scalar")]
    public void SetScalar_reports_unsupported_targets_instead_of_guessing(string text, string key, string code)
    {
        Code(text, new SetScalar(P(key), "v")).ShouldBe(code);
    }

    [Fact]
    public void Adding_to_flow_collections_and_explicit_key_mappings_is_reported_as_not_applicable()
    {
        Code("a: {x: 1}\n", new AddKey(P("a"), "k", "v")).ShouldBe("edit.not_applicable.flow_collection");
        Code("a: [1]\n", new AppendItem(P("a"), "v")).ShouldBe("edit.not_applicable.flow_collection");
        Code("? [a, b]\n: v\n", new AddKey(YamlPath.Root, "k", "x")).ShouldBe("edit.not_applicable.no_standalone_key");
    }

    [Fact]
    public void Adding_an_existing_key_is_refused()
    {
        Code("a: 1\n", new AddKey(YamlPath.Root, "a", "2")).ShouldBe("edit.not_applicable.duplicate_key");
    }

    [Fact]
    public void Missing_path_is_a_not_found_error()
    {
        Code("a: 1\n", new SetScalar(P("nope"), "v")).ShouldBe("edit.path_not_found");
    }

    [Fact]
    public void Formatter_quotes_control_characters_with_escapes()
    {
        Edit("a: x\n", new SetScalar(P("a"), "l1\nl2")).ShouldBe("a: \"l1\\nl2\"\n");
    }
}
