using System.IO.Pipes;
using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>
/// Accepts clients on the engine pipe and bridges each one to a fresh engine connection. Several accept loops run at
/// once so there is always a pending listener while another client is being set up.
/// </summary>
public sealed class RelayServer(RelayOptions options, IPipeServerFactory pipes, IEngineTransport transport, ILogger logger)
{
    private static readonly TimeSpan _drainTimeout = TimeSpan.FromSeconds(5);

    private int _active;
    private long _total;

    public event EventHandler? ConnectionCountChanged;

    public int ActiveConnections => Volatile.Read(ref _active);

    public long TotalConnections => Interlocked.Read(ref _total);

    public DateTimeOffset StartedAt { get; private set; }

    public async Task RunAsync(CancellationToken ct)
    {
        StartedAt = DateTimeOffset.UtcNow;
        RelayLog.Started(logger, options.PipeName, options.Transport, options.Distro);

        // The very first instance is created up front with FirstPipeInstance so a squatter cannot win the name.
        var first = pipes.Create(options.PipeName, PipeKind.Message, firstInstance: true);
        var handlers = new List<Task>();
        var loops = Enumerable.Range(0, Math.Max(1, options.AcceptLoops))
            .Select(i => AcceptLoopAsync(i == 0 ? first : null, handlers, ct))
            .ToArray();

        try
        {
            await Task.WhenAll(loops).ConfigureAwait(false);
        }
        finally
        {
            Task[] pending;
            lock (handlers)
            {
                pending = [.. handlers];
            }

            await Task.WhenAll(pending).ConfigureAwait(false);
            RelayLog.Stopped(logger, TotalConnections);
        }
    }

    private async Task AcceptLoopAsync(NamedPipeServerStream? initial, List<Task> handlers, CancellationToken ct)
    {
        var next = initial;
        while (!ct.IsCancellationRequested)
        {
            var server = next ?? pipes.Create(options.PipeName, PipeKind.Message, firstInstance: false);
            next = null;
            try
            {
                await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                await server.DisposeAsync().ConfigureAwait(false);
                return;
            }
            catch (IOException ex)
            {
                RelayLog.AcceptFailed(logger, ex);
                await server.DisposeAsync().ConfigureAwait(false);
                continue;
            }

            var handler = HandleAsync(server, ct);
            lock (handlers)
            {
                handlers.RemoveAll(t => t.IsCompleted);
                handlers.Add(handler);
            }
        }
    }

    private async Task HandleAsync(NamedPipeServerStream client, CancellationToken ct)
    {
        await using (client.ConfigureAwait(false))
        {
            var active = Interlocked.Increment(ref _active);
            _ = Interlocked.Increment(ref _total);
            RelayLog.ClientConnected(logger, active);
            ConnectionCountChanged?.Invoke(this, EventArgs.Empty);
            try
            {
                EngineConnection engine;
                try
                {
                    engine = await transport.OpenAsync(ct).ConfigureAwait(false);
                }
                catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
                {
                    RelayLog.EngineUnavailable(logger, ex);
                    return;
                }

                await using (engine.ConfigureAwait(false))
                {
                    await ConnectionPump.RunAsync(new StreamDuplexPipe(client), engine, ct).ConfigureAwait(false);
                    await DrainAsync(client).ConfigureAwait(false);
                }
            }
            catch (Exception ex) when (ex is IOException or ObjectDisposedException)
            {
                RelayLog.ConnectionFailed(logger, ex);
            }
            catch (OperationCanceledException)
            {
                // Relay is shutting down.
            }
            finally
            {
                var remaining = Interlocked.Decrement(ref _active);
                RelayLog.ClientFinished(logger, remaining);
                ConnectionCountChanged?.Invoke(this, EventArgs.Empty);
            }
        }
    }

    /// <summary>On Windows, closing a pipe with unread data discards it; wait (bounded) until the client has read everything.</summary>
    private static async Task DrainAsync(NamedPipeServerStream client)
    {
        if (!OperatingSystem.IsWindows() || !client.IsConnected)
        {
            return;
        }

        try
        {
            await Task.Run(client.WaitForPipeDrain).WaitAsync(_drainTimeout).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or TimeoutException or ObjectDisposedException)
        {
            // Client already gone or too slow: nothing left to protect.
        }
    }
}
