using System.IO.Pipes;
using Microsoft.Extensions.Logging.Abstractions;

namespace Nautix.EngineRelay.Tests;

/// <summary>A relay on a unique pipe name with a loopback engine, started and stopped like the real process would be.</summary>
internal sealed class RunningRelay : IAsyncDisposable
{
    private readonly CancellationTokenSource _stop = new();
    private readonly Task _run;

    public RunningRelay(IEngineTransport? transport = null, string? pipeName = null, int acceptLoops = 4)
    {
        PipeName = pipeName ?? TestData.UniquePipeName();
        Transport = transport ?? new LoopbackEngineTransport();
        Options = new RelayOptions { PipeName = PipeName, AcceptLoops = acceptLoops };
        Server = new RelayServer(Options, new PortablePipeServerFactory(), Transport, NullLogger.Instance);
        _run = Task.Run(() => Server.RunAsync(_stop.Token));
    }

    public string PipeName { get; }

    public IEngineTransport Transport { get; }

    public RelayOptions Options { get; }

    public RelayServer Server { get; }

    public async Task<NamedPipeClientStream> ConnectAsync()
    {
        var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await client.ConnectAsync(10_000);
        return client;
    }

    public async Task StopAsync()
    {
        await _stop.CancelAsync();
        await _run.WaitAsync(TimeSpan.FromSeconds(15));
    }

    public async ValueTask DisposeAsync()
    {
        if (!_stop.IsCancellationRequested)
        {
            await StopAsync();
        }

        _stop.Dispose();
    }
}
