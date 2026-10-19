namespace Nautix.SharedKernel;

/// <summary>Marks a request that must be confirmed before execution (rm, prune, rmi, volume rm, ...).</summary>
public interface IDestructive
{
    ConfirmationRequest Confirmation { get; }
}
