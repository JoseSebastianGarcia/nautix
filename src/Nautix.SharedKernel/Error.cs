namespace Nautix.SharedKernel;

/// <summary>
/// An expected failure. <see cref="Code"/> is stable and doubles as the resource key suffix for
/// user-facing text; <see cref="Message"/> is developer-facing and is not translated.
/// </summary>
public sealed record Error
{
    public Error(string code, string message, ErrorKind kind = ErrorKind.Failure)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        ArgumentNullException.ThrowIfNull(message);
        Code = code;
        Message = message;
        Kind = kind;
    }

    public string Code { get; }

    public string Message { get; }

    public ErrorKind Kind { get; }

    public static Error Failure(string code, string message) => new(code, message);

    public static Error Validation(string code, string message) => new(code, message, ErrorKind.Validation);

    public static Error NotFound(string code, string message) => new(code, message, ErrorKind.NotFound);

    public static Error Conflict(string code, string message) => new(code, message, ErrorKind.Conflict);

    public static Error Cancelled() => new("operation.cancelled", "The operation was cancelled.", ErrorKind.Cancelled);

    public static Error Unexpected(string code, string message) => new(code, message, ErrorKind.Unexpected);
}
