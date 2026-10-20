using System.IO.Pipelines;

namespace Nautix.EngineRelay;

/// <summary>
/// Copies bytes both ways between a client pipe and an engine connection.
/// Client end-of-stream is a half-close: the engine's input is completed (so <c>docker system dial-stdio</c> shuts
/// down the socket's write side) while the response is still delivered. The pump ends when the engine side ends,
/// or when either direction fails; the caller then disposes the engine connection, which kills the child process.
/// </summary>
public static class ConnectionPump
{
    public static async Task RunAsync(IDuplexPipe client, EngineConnection engine, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(engine);

        using var cancellation = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var toEngine = CopyAsync(client.Input, engine.ToEngine, cancellation.Token);
        var fromEngine = CopyAsync(engine.FromEngine, client.Output, cancellation.Token);

        var first = await Task.WhenAny(toEngine, fromEngine).ConfigureAwait(false);
        if (first == fromEngine || first.IsFaulted || first.IsCanceled)
        {
            // Engine finished (nothing more can be delivered), a side failed, or we were cancelled: stop the other direction.
            await cancellation.CancelAsync().ConfigureAwait(false);
        }

        // Otherwise the client half-closed: the engine is still answering, so wait for it below.
        await Task.WhenAll(Settle(toEngine), Settle(fromEngine)).ConfigureAwait(false);
        await client.Output.CompleteAsync().ConfigureAwait(false);
        await client.Input.CompleteAsync().ConfigureAwait(false);

        // Caller-requested cancellation is reported after everything is released, whichever side noticed it first.
        ct.ThrowIfCancellationRequested();
    }

    private static async Task CopyAsync(PipeReader reader, PipeWriter writer, CancellationToken ct)
    {
        try
        {
            await reader.CopyToAsync(writer, ct).ConfigureAwait(false);
            await writer.CompleteAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            await writer.CompleteAsync(ex).ConfigureAwait(false);
            throw;
        }
    }

    /// <summary>A copy that failed or was cancelled during teardown is expected; teardown must not throw.</summary>
    private static async Task Settle(Task copy)
    {
        try
        {
            await copy.ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException)
        {
            // Already reflected by completing the writer with the exception.
        }
    }
}
