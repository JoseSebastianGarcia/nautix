using System.IO.Pipelines;
using Nautix.EngineRelay;

namespace Nautix.EngineRelay.Tests;

/// <summary>
/// In-memory stand-in for the engine: echoes whatever it receives, and finishes (half-close) when its input ends.
/// Counts opened/disposed connections so tests can prove the relay releases the engine side.
/// </summary>
internal sealed class LoopbackEngineTransport(int? closeAfterBytes = null, Exception? openFailure = null) : IEngineTransport
{
    private int _opened;
    private int _disposed;

    public int Opened => Volatile.Read(ref _opened);

    public int Disposed => Volatile.Read(ref _disposed);

    public ValueTask<EngineConnection> OpenAsync(CancellationToken ct)
    {
        if (openFailure is not null)
        {
            throw openFailure;
        }

        _ = Interlocked.Increment(ref _opened);
        var toEngine = new Pipe();
        var fromEngine = new Pipe();
        var cancellation = new CancellationTokenSource();
        var echo = Task.Run(() => EchoAsync(toEngine.Reader, fromEngine.Writer, closeAfterBytes, cancellation.Token), CancellationToken.None);
        return ValueTask.FromResult(new EngineConnection(fromEngine.Reader, toEngine.Writer, new Lifetime(this, cancellation, echo)));
    }

    private static async Task EchoAsync(PipeReader input, PipeWriter output, int? closeAfterBytes, CancellationToken ct)
    {
        long received = 0;
        try
        {
            while (true)
            {
                var result = await input.ReadAsync(ct).ConfigureAwait(false);
                foreach (var segment in result.Buffer)
                {
                    var take = closeAfterBytes is { } limit ? (int)Math.Min(segment.Length, limit - received) : segment.Length;
                    if (take > 0)
                    {
                        await output.WriteAsync(segment[..take], ct).ConfigureAwait(false);
                        received += take;
                    }
                }

                input.AdvanceTo(result.Buffer.End);
                if (result.IsCompleted || (closeAfterBytes is { } l && received >= l))
                {
                    break;
                }
            }
        }
        catch (Exception ex) when (ex is OperationCanceledException or InvalidOperationException)
        {
            // Connection disposed.
        }

        await output.CompleteAsync().ConfigureAwait(false);
    }

    private sealed class Lifetime(LoopbackEngineTransport owner, CancellationTokenSource cancellation, Task echo) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            await cancellation.CancelAsync();
            await echo;
            cancellation.Dispose();
            _ = Interlocked.Increment(ref owner._disposed);
        }
    }
}
