using System.IO.Pipelines;

namespace Nautix.EngineRelay;

/// <summary>One live link to the engine: bytes we write reach the daemon, bytes the daemon writes come back.</summary>
public sealed class EngineConnection(PipeReader fromEngine, PipeWriter toEngine, IAsyncDisposable lifetime) : IAsyncDisposable
{
    public PipeReader FromEngine { get; } = fromEngine;

    public PipeWriter ToEngine { get; } = toEngine;

    public ValueTask DisposeAsync() => lifetime.DisposeAsync();
}
