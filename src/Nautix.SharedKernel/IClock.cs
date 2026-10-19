namespace Nautix.SharedKernel;

/// <summary>Source of the current time; the only way Domain/Application read the clock.</summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }
}
