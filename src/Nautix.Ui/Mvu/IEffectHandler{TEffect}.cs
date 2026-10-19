namespace Nautix.Ui.Mvu;

public interface IEffectHandler<in TEffect>
    where TEffect : IEffect
{
    Task HandleAsync(TEffect effect, Action<IMsg> dispatch, CancellationToken ct);
}
