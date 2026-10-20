namespace Nautix.Spikes.S1.Verification;

internal sealed record EditOutcome(string Kind, string Path, EditStatus Status, string? Detail);
