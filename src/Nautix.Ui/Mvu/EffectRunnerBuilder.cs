namespace Nautix.Ui.Mvu;

/// <summary>Collects effect handlers; the composition root builds one runner per application.</summary>
public sealed class EffectRunnerBuilder
{
    private readonly Dictionary<Type, Func<IEffect, Action<IMsg>, CancellationToken, Task>> _handlers = [];

    public EffectRunnerBuilder Add<TEffect>(IEffectHandler<TEffect> handler)
        where TEffect : IEffect
    {
        ArgumentNullException.ThrowIfNull(handler);
        if (!_handlers.TryAdd(typeof(TEffect), (effect, dispatch, ct) => handler.HandleAsync((TEffect)effect, dispatch, ct)))
        {
            throw new InvalidOperationException($"A handler for {typeof(TEffect).FullName} is already registered.");
        }

        return this;
    }

    public EffectRunner Build() => new(new Dictionary<Type, Func<IEffect, Action<IMsg>, CancellationToken, Task>>(_handlers));
}
