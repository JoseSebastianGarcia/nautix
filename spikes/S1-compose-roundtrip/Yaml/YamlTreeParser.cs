using System.Collections.Immutable;
using Nautix.SharedKernel;
using YamlDotNet.Core;
using YamlDotNet.Core.Events;

namespace Nautix.Spikes.S1.Yaml;

/// <summary>Builds a <see cref="YamlSyntaxTree"/> from YamlDotNet parser events and their marks (strategy A of S1).</summary>
internal static class YamlTreeParser
{
    public static Result<YamlSyntaxTree> Parse(string text)
    {
        ArgumentNullException.ThrowIfNull(text);

        // The scanner folds a BOM into the first scalar, so parse the body and shift every mark by the BOM length.
        var hasBom = text.Length > 0 && text[0] == '﻿';
        var offset = hasBom ? 1 : 0;
        var documents = ImmutableArray.CreateBuilder<YamlDocument>();
        var stack = new Stack<Frame>();
        YamlNode? root = null;
        var documentStart = 0;

        try
        {
            var parser = new Parser(new StringReader(text[offset..]));
            while (parser.MoveNext())
            {
                switch (parser.Current)
                {
                    case DocumentStart start:
                        documentStart = (int)start.Start.Index + offset;
                        root = null;
                        break;
                    case DocumentEnd end:
                        documents.Add(new YamlDocument(root, documentStart, (int)end.End.Index + offset));
                        break;
                    case MappingStart mapping:
                        stack.Push(new Frame(true, mapping.Style == MappingStyle.Flow, Anchor(mapping.Anchor), (int)mapping.Start.Index + offset));
                        break;
                    case SequenceStart sequence:
                        stack.Push(new Frame(false, sequence.Style == SequenceStyle.Flow, Anchor(sequence.Anchor), (int)sequence.Start.Index + offset));
                        break;
                    case MappingEnd or SequenceEnd:
                        Attach(Close(stack.Pop(), text, (int)parser.Current.End.Index + offset), stack, ref root);
                        break;
                    case Scalar scalar:
                        Attach(ToScalar(scalar, text, offset), stack, ref root);
                        break;
                    case AnchorAlias alias:
                        Attach(new YamlAlias((int)alias.Start.Index + offset, (int)alias.End.Index + offset, alias.Value.Value), stack, ref root);
                        break;
                    default:
                        break;
                }
            }
        }
        catch (YamlException ex)
        {
            return Result.Failure<YamlSyntaxTree>(Error.Validation("yaml.syntax", ex.Message));
        }

        return Result.Success(new YamlSyntaxTree(text, hasBom, documents.ToImmutable()));
    }

    private static string? Anchor(AnchorName anchor) => anchor.IsEmpty ? null : anchor.Value;

    private static void Attach(YamlNode node, Stack<Frame> stack, ref YamlNode? root)
    {
        if (stack.Count > 0)
        {
            stack.Peek().Children.Add(node);
        }
        else
        {
            root = node;
        }
    }

    private static YamlScalar ToScalar(Scalar scalar, string text, int offset)
    {
        var style = scalar.Style switch
        {
            ScalarStyle.SingleQuoted => YamlScalarStyle.SingleQuoted,
            ScalarStyle.DoubleQuoted => YamlScalarStyle.DoubleQuoted,
            ScalarStyle.Literal => YamlScalarStyle.Literal,
            ScalarStyle.Folded => YamlScalarStyle.Folded,
            _ => YamlScalarStyle.Plain,
        };

        var end = (int)scalar.End.Index + offset;
        var start = SkipProperties(text, (int)scalar.Start.Index + offset, end);
        if (style == YamlScalarStyle.Plain && scalar.Value.Length == 0)
        {
            return new YamlScalar(start, start, Anchor(scalar.Anchor), string.Empty, style);
        }

        return new YamlScalar(start, end, Anchor(scalar.Anchor), scalar.Value, style);
    }

    private static YamlNode Close(Frame frame, string text, int endMarkIndex)
    {
        if (frame.IsMapping)
        {
            var entries = ImmutableArray.CreateBuilder<YamlMappingEntry>(frame.Children.Count / 2);
            for (var i = 0; i + 1 < frame.Children.Count; i += 2)
            {
                entries.Add(new YamlMappingEntry(frame.Children[i], frame.Children[i + 1]));
            }

            var built = entries.ToImmutable();
            if (frame.IsFlow)
            {
                return new YamlMapping(SkipProperties(text, frame.StartIndex, endMarkIndex), endMarkIndex + 1, frame.Anchor, true, built);
            }

            var provisional = new YamlMapping(built.Length > 0 ? built[0].Key.Start : frame.StartIndex, endMarkIndex, frame.Anchor, false, built);
            return provisional with { End = YamlExtents.ContentEnd(provisional) };
        }

        var items = frame.Children.ToImmutableArray();
        if (frame.IsFlow)
        {
            return new YamlSequence(SkipProperties(text, frame.StartIndex, endMarkIndex), endMarkIndex + 1, frame.Anchor, true, items);
        }

        var sequence = new YamlSequence(items.Length > 0 ? items[0].Start : frame.StartIndex, endMarkIndex, frame.Anchor, false, items);
        return sequence with { End = YamlExtents.ContentEnd(sequence) };
    }

    /// <summary>Anchors and tags are part of the event span but not of the value span.</summary>
    private static int SkipProperties(string text, int start, int limit)
    {
        var i = start;
        while (i < limit && i < text.Length && (text[i] == '&' || text[i] == '!'))
        {
            while (i < limit && !char.IsWhiteSpace(text[i]))
            {
                i++;
            }

            while (i < limit && char.IsWhiteSpace(text[i]))
            {
                i++;
            }
        }

        return i;
    }

    private sealed class Frame(bool isMapping, bool isFlow, string? anchor, int startIndex)
    {
        public bool IsMapping { get; } = isMapping;

        public bool IsFlow { get; } = isFlow;

        public string? Anchor { get; } = anchor;

        public int StartIndex { get; } = startIndex;

        public List<YamlNode> Children { get; } = [];
    }
}
