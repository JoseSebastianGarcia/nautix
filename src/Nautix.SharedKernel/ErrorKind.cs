namespace Nautix.SharedKernel;

/// <summary>Coarse category of an expected failure; the UI maps it to presentation, never to control flow.</summary>
public enum ErrorKind
{
    Failure,
    Validation,
    NotFound,
    Conflict,
    Cancelled,
    Unexpected,
}
