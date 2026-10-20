using Nautix.SharedKernel;

namespace Nautix.Spikes.S1.Editing;

internal static class EditErrors
{
    public const string NotApplicablePrefix = "edit.not_applicable.";

    /// <summary>The edit is valid YAML-wise but this spike does not implement it (reported, not counted as a defect).</summary>
    public static Error NotApplicable(string reason, string message) =>
        Error.Failure(NotApplicablePrefix + reason, message);

    public static Error PathNotFound(YamlPath path) => Error.NotFound("edit.path_not_found", $"No node at {path}.");
}
