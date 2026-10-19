namespace Nautix.SharedKernel;

/// <summary>Outcome of an operation that yields <typeparamref name="T"/> on success.</summary>
public sealed class Result<T>
{
    private readonly T? _value;
    private readonly Error? _error;

    private Result(T? value, Error? error)
    {
        _value = value;
        _error = error;
    }

    public bool IsSuccess => _error is null;

    public bool IsFailure => _error is not null;

    public T Value => _error is null
        ? _value!
        : throw new InvalidOperationException("A failed result has no value.");

    public Error Error => _error ?? throw new InvalidOperationException("A successful result has no error.");

    internal static Result<T> Create(T value) => new(value, null);

    internal static Result<T> Create(Error error)
    {
        ArgumentNullException.ThrowIfNull(error);
        return new Result<T>(default, error);
    }

    public Result<TOut> Map<TOut>(Func<T, TOut> map)
    {
        ArgumentNullException.ThrowIfNull(map);
        return _error is null ? Result.Success(map(_value!)) : Result.Failure<TOut>(_error);
    }

    public Result<TOut> Bind<TOut>(Func<T, Result<TOut>> bind)
    {
        ArgumentNullException.ThrowIfNull(bind);
        return _error is null ? bind(_value!) : Result.Failure<TOut>(_error);
    }

    public TOut Match<TOut>(Func<T, TOut> onSuccess, Func<Error, TOut> onFailure)
    {
        ArgumentNullException.ThrowIfNull(onSuccess);
        ArgumentNullException.ThrowIfNull(onFailure);
        return _error is null ? onSuccess(_value!) : onFailure(_error);
    }

    public T GetValueOrDefault(T fallback) => _error is null ? _value! : fallback;

    public Result ToResult() => _error is null ? Result.Success() : Result.Failure(_error);
}
