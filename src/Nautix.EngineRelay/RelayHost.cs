using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>Composition of the relay: engine pipe, control pipe and distro keep-alive, with one shared shutdown.</summary>
public static class RelayHost
{
    private static readonly TimeSpan _keepAliveReleaseDelay = TimeSpan.FromSeconds(30);

    public static async Task RunAsync(
        RelayOptions options,
        IPipeServerFactory pipes,
        IEngineTransport transport,
        Func<CancellationToken, ValueTask<IAsyncDisposable>> startKeepAlive,
        ILogger logger,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(options);
        ArgumentNullException.ThrowIfNull(pipes);
        ArgumentNullException.ThrowIfNull(transport);
        ArgumentNullException.ThrowIfNull(startKeepAlive);
        ArgumentNullException.ThrowIfNull(logger);

        using var stop = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var relay = new RelayServer(options, pipes, transport, logger);
        var control = new ControlServer(options, pipes, relay, stop.Cancel, logger);
        await using var keepAlive = new DistroKeepAlive(startKeepAlive, options.Distro, _keepAliveReleaseDelay, logger);

        relay.ConnectionCountChanged += (_, _) =>
            keepAlive.Update(options.KeepAlive || relay.ActiveConnections > 0, options.KeepAlive ? "engine.keepAlive" : "active clients");
        keepAlive.Update(options.KeepAlive, "engine.keepAlive");

        await Task.WhenAll(relay.RunAsync(stop.Token), control.RunAsync(stop.Token)).ConfigureAwait(false);
    }
}
