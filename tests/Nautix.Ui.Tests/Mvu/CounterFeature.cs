using System.Collections.Immutable;
using Nautix.Ui.Mvu;

namespace Nautix.Ui.Tests.Mvu;

public sealed record CounterState(int Count, string? Error = null);

public sealed record Increment(int By = 1) : IMsg;

public sealed record IncrementLater(int By) : IMsg;

public sealed record Fail : IMsg;

public sealed record DelayedIncrement(int By) : IEffect;

public sealed record Explode : IEffect;

public sealed record Unhandled : IEffect;

public static class CounterFeature
{
    public static (CounterState State, ImmutableArray<IEffect> Effects) Update(CounterState state, IMsg msg) => msg switch
    {
        Increment m => (state with { Count = state.Count + m.By }, []),
        IncrementLater m => (state, [new DelayedIncrement(m.By)]),
        Fail => (state, [new Explode()]),
        EffectFailed f => (state with { Error = f.Exception.Message }, []),
        _ => (state, []),
    };
}

public sealed class DelayedIncrementHandler : IEffectHandler<DelayedIncrement>
{
    public Task HandleAsync(DelayedIncrement effect, Action<IMsg> dispatch, CancellationToken ct)
    {
        dispatch(new Increment(effect.By));
        return Task.CompletedTask;
    }
}

public sealed class ExplodeHandler : IEffectHandler<Explode>
{
    public Task HandleAsync(Explode effect, Action<IMsg> dispatch, CancellationToken ct) =>
        throw new InvalidOperationException("boom");
}
