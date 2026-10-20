using Nautix.SharedKernel;
using Nautix.Spikes.S1.Editing;
using YamlDotNet.Core;
using Rep = YamlDotNet.RepresentationModel;

namespace Nautix.Spikes.S1.Verification;

/// <summary>
/// Independent check of an edit: apply it to YamlDotNet's representation model of the original, parse the patched
/// text with the same library, and require identical trees (values, order, anchors, alias sharing). The oracle does
/// not use any position information, so it cannot share a bug with the patcher.
/// </summary>
internal static class RepresentationOracle
{
    public static Result Verify(string original, string patched, ComposeEdit edit)
    {
        ArgumentNullException.ThrowIfNull(edit);
        var expected = Load(original);
        var actual = Load(patched);
        if (expected.IsFailure)
        {
            return Result.Failure(expected.Error);
        }

        if (actual.IsFailure)
        {
            return Result.Failure(Error.Validation("oracle.patched_unparsable", "Patched text no longer parses: " + actual.Error.Message));
        }

        var applied = Apply(expected.Value, edit);
        if (applied.IsFailure)
        {
            return applied;
        }

        var difference = FirstDifference(expected.Value, actual.Value);
        return difference is null
            ? Result.Success()
            : Result.Failure(Error.Failure("oracle.mismatch", difference));
    }

    private static Result<Rep.YamlStream> Load(string text)
    {
        try
        {
            var stream = new Rep.YamlStream();
            stream.Load(new StringReader(text.TrimStart('﻿')));
            return Result.Success(stream);
        }
        catch (Exception ex) when (ex is YamlException or ArgumentException or InvalidOperationException)
        {
            return Result.Failure<Rep.YamlStream>(Error.Validation("oracle.unloadable", ex.Message));
        }
    }

    private static Result Apply(Rep.YamlStream stream, ComposeEdit edit)
    {
        if (edit is NoOp)
        {
            return Result.Success();
        }

        var root = stream.Documents[0].RootNode;
        switch (edit)
        {
            case SetScalar e when Resolve(root, e.Path) is Rep.YamlScalarNode scalar:
                scalar.Value = e.Value;
                return Result.Success();
            case AddKey e when Resolve(root, e.Mapping) is Rep.YamlMappingNode mapping:
                mapping.Add(e.Key, e.Value);
                return Result.Success();
            case RemoveKey e when Resolve(root, e.Entry.Parent) is Rep.YamlMappingNode parent:
                var key = parent.Children.Keys.OfType<Rep.YamlScalarNode>().FirstOrDefault(k => k.Value == e.Entry.Last);
                return key is not null && parent.Children.Remove(key)
                    ? Result.Success()
                    : Result.Failure(Error.NotFound("oracle.key_missing", e.Entry.ToString()));
            case AppendItem e when Resolve(root, e.Sequence) is Rep.YamlSequenceNode sequence:
                sequence.Add(e.Value);
                return Result.Success();
            default:
                return Result.Failure(Error.NotFound("oracle.target_missing", "Oracle could not resolve the edit target."));
        }
    }

    private static Rep.YamlNode? Resolve(Rep.YamlNode root, YamlPath path)
    {
        Rep.YamlNode? current = root;
        foreach (var segment in path.Segments)
        {
            current = current switch
            {
                Rep.YamlMappingNode m => m.Children.FirstOrDefault(kv => kv.Key is Rep.YamlScalarNode s && s.Value == segment).Value,
                Rep.YamlSequenceNode q when segment.StartsWith('[') && int.TryParse(segment.AsSpan(1, segment.Length - 2), out var i)
                    && i >= 0 && i < q.Children.Count => q.Children[i],
                _ => null,
            };
            if (current is null)
            {
                return null;
            }
        }

        return current;
    }

    private static string? FirstDifference(Rep.YamlStream expected, Rep.YamlStream actual)
    {
        if (expected.Documents.Count != actual.Documents.Count)
        {
            return $"document count {expected.Documents.Count} != {actual.Documents.Count}";
        }

        var seen = new Dictionary<object, HashSet<object>>(ReferenceEqualityComparer.Instance);
        for (var i = 0; i < expected.Documents.Count; i++)
        {
            var difference = Compare(expected.Documents[i].RootNode, actual.Documents[i].RootNode, $"doc{i}:", seen);
            if (difference is not null)
            {
                return difference;
            }
        }

        return null;
    }

    private static string? Compare(Rep.YamlNode a, Rep.YamlNode b, string path, Dictionary<object, HashSet<object>> seen)
    {
        if (seen.TryGetValue(a, out var partners) && partners.Contains(b))
        {
            return null;
        }

        if (!seen.TryGetValue(a, out partners))
        {
            seen[a] = partners = new HashSet<object>(ReferenceEqualityComparer.Instance);
        }

        partners.Add(b);

        if (a.GetType() != b.GetType())
        {
            return $"{path} node type {a.GetType().Name} != {b.GetType().Name}";
        }

        var anchorA = a.Anchor.IsEmpty ? null : a.Anchor.Value;
        var anchorB = b.Anchor.IsEmpty ? null : b.Anchor.Value;
        if (anchorA != anchorB)
        {
            return $"{path} anchor '{anchorA}' != '{anchorB}'";
        }

        switch (a)
        {
            case Rep.YamlScalarNode sa when b is Rep.YamlScalarNode sb:
                return sa.Value == sb.Value ? null : $"{path} value '{sa.Value}' != '{sb.Value}'";
            case Rep.YamlSequenceNode qa when b is Rep.YamlSequenceNode qb:
                if (qa.Children.Count != qb.Children.Count)
                {
                    return $"{path} sequence length {qa.Children.Count} != {qb.Children.Count}";
                }

                for (var i = 0; i < qa.Children.Count; i++)
                {
                    var d = Compare(qa.Children[i], qb.Children[i], $"{path}[{i}]", seen);
                    if (d is not null)
                    {
                        return d;
                    }
                }

                return null;
            case Rep.YamlMappingNode ma when b is Rep.YamlMappingNode mb:
                if (ma.Children.Count != mb.Children.Count)
                {
                    return $"{path} mapping size {ma.Children.Count} != {mb.Children.Count}";
                }

                var left = ma.Children.ToList();
                var right = mb.Children.ToList();
                for (var i = 0; i < left.Count; i++)
                {
                    var d = Compare(left[i].Key, right[i].Key, $"{path}/key{i}", seen)
                        ?? Compare(left[i].Value, right[i].Value, $"{path}/{(left[i].Key as Rep.YamlScalarNode)?.Value ?? i.ToString(System.Globalization.CultureInfo.InvariantCulture)}", seen);
                    if (d is not null)
                    {
                        return d;
                    }
                }

                return null;
            default:
                return null;
        }
    }
}
