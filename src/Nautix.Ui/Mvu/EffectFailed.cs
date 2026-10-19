namespace Nautix.Ui.Mvu;

/// <summary>Dispatched by the store when an effect handler throws, so <c>Update</c> can surface the fault.</summary>
public sealed record EffectFailed(IEffect Effect, Exception Exception) : IMsg;
