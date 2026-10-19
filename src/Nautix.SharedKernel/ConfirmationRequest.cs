using System.Collections.Immutable;

namespace Nautix.SharedKernel;

/// <summary>What the user is asked to confirm: the operation and the exact objects it will affect.</summary>
public sealed record ConfirmationRequest
{
    public ConfirmationRequest(
        string operationKey,
        ImmutableArray<string> affectedObjects,
        ConfirmationLevel level = ConfirmationLevel.Standard)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(operationKey);
        if (affectedObjects.IsDefaultOrEmpty)
        {
            throw new ArgumentException("A confirmation must list the affected objects.", nameof(affectedObjects));
        }

        OperationKey = operationKey;
        AffectedObjects = affectedObjects;
        Level = level;
    }

    /// <summary>Stable key such as <c>containers.rm</c>; also selects the localized confirmation text.</summary>
    public string OperationKey { get; }

    public ImmutableArray<string> AffectedObjects { get; }

    public ConfirmationLevel Level { get; }
}
