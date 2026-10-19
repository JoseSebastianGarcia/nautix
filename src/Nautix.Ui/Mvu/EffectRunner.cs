using System.Collections.Frozen;

namespace Nautix.Ui.Mvu;

/// <summary>Routes each effect to the handler registered for its exact runtime type.</summary>
public sealed class EffectRunner : IEffectRunner
{
    private readonly FrozenDictionary<Type, Func<IEffect, Action<IMsg>, CancellationToken, Task>> _handlers;

    internal EffectRunner(Dictionary<Type, Func<IEffect, Action<IMsg>, CancellationToken, Task>> handlers) =>
        _handlers = handlers.ToFrozenDictionary();

    public Task RunAsync(IEffect effect, Action<IMsg> dispatch, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(effect);
        ArgumentNullException.ThrowIfNull(dispatch);

        return _handlers.TryGetValue(effect.GetType(), out var handler)
            ? handler(effect, dispatch, ct)
            : throw new InvalidOperationException($"No handler registered for effect {effect.GetType().FullName}.");
    }
}
