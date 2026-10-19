namespace Nautix.Ui.Mvu;

public interface IEffectRunner
{
    Task RunAsync(IEffect effect, Action<IMsg> dispatch, CancellationToken ct);
}
