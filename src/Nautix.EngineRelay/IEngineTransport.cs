namespace Nautix.EngineRelay;

/// <summary>Opens one connection to the Docker engine per client connection (spec: <c>IEngineTransport</c>, selectable by <c>engine.transport</c>).</summary>
public interface IEngineTransport
{
    ValueTask<EngineConnection> OpenAsync(CancellationToken ct);
}
