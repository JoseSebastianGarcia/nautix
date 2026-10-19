namespace Nautix.SharedKernel;

/// <summary>Outcome of an operation without a value. Expected failures are values, not exceptions.</summary>
public sealed class Result
{
    private static readonly Result _success = new(null);

    private readonly Error? _error;

    private Result(Error? error) => _error = error;

    public bool IsSuccess => _error is null;

    public bool IsFailure => _error is not null;

    public Error Error => _error ?? throw new InvalidOperationException("A successful result has no error.");

    public static Result Success() => _success;

    public static Result Failure(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result(error);
    }

    public static Result<T> Success<T>(T value) => Result<T>.Create(value);

    public static Result<T> Failure<T>(Error error) => Result<T>.Create(error);
}
