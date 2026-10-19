namespace Nautix.SharedKernel;

/// <summary>Decides whether a destructive operation may proceed, normally by asking the user.</summary>
public interface IConfirmationPolicy
{
    ValueTask<bool> ConfirmAsync(ConfirmationRequest request, CancellationToken ct);
}
