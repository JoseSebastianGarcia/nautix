using System.IO.Pipes;
using Microsoft.Extensions.Logging.Abstractions;
using Shouldly;

namespace Nautix.EngineRelay.Tests;

public sealed class KeepAliveAndHostTests
{
    private sealed class Handle : IAsyncDisposable
    {
        public bool Disposed { get; private set; }

        public ValueTask DisposeAsync()
        {
            Disposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private static (DistroKeepAlive KeepAlive, List<Handle> Handles) Create(TimeSpan delay)
    {
        var handles = new List<Handle>();
        var keepAlive = new DistroKeepAlive(
            _ =>
            {
                var handle = new Handle();
                lock (handles)
                {
                    handles.Add(handle);
                }

                return ValueTask.FromResult<IAsyncDisposable>(handle);
            },
            "nautix-test",
            delay,
            NullLogger.Instance);
        return (keepAlive, handles);
    }

    [Fact]
    public async Task Needing_the_distro_starts_exactly_one_keep_alive()
    {
        var (keepAlive, handles) = Create(TimeSpan.FromMilliseconds(50));
        await using (keepAlive)
        {
            keepAlive.Update(true, "test");
            keepAlive.Update(true, "test");

            await Eventually.TrueAsync(() => keepAlive.IsHeld, "keep-alive held");
            handles.Count.ShouldBe(1);
        }

        handles[0].Disposed.ShouldBeTrue();
    }

    [Fact]
    public async Task Release_is_delayed_and_can_be_cancelled_by_new_demand()
    {
        var (keepAlive, handles) = Create(TimeSpan.FromMilliseconds(300));
        await using (keepAlive)
        {
            keepAlive.Update(true, "test");
            await Eventually.TrueAsync(() => keepAlive.IsHeld, "held");

            keepAlive.Update(false, "test");
            await Task.Delay(100);
            keepAlive.IsHeld.ShouldBeTrue("still inside the grace period");
            keepAlive.Update(true, "test");
            await Task.Delay(400);

            keepAlive.IsHeld.ShouldBeTrue("new demand cancelled the release");
            handles.Count.ShouldBe(1);
        }
    }

    [Fact]
    public async Task Idle_distro_keep_alive_is_released_after_the_grace_period()
    {
        var (keepAlive, handles) = Create(TimeSpan.FromMilliseconds(50));
        await using (keepAlive)
        {
            keepAlive.Update(true, "test");
            await Eventually.TrueAsync(() => keepAlive.IsHeld, "held");

            keepAlive.Update(false, "test");

            await Eventually.TrueAsync(() => !keepAlive.IsHeld, "released");
            handles[0].Disposed.ShouldBeTrue();
        }
    }

    [Fact]
    public async Task Host_serves_clients_answers_control_commands_and_stops_on_shutdown()
    {
        var name = TestData.UniquePipeName();
        var options = new RelayOptions { PipeName = name, ControlPipeName = name + "-ctl", KeepAlive = true };
        var (keepAlive, handles) = Create(TimeSpan.FromSeconds(30));
        await keepAlive.DisposeAsync();
        var started = 0;
        var host = Task.Run(() => RelayHost.RunAsync(
            options,
            new PortablePipeServerFactory(),
            new LoopbackEngineTransport(),
            ct =>
            {
                _ = Interlocked.Increment(ref started);
                return ValueTask.FromResult<IAsyncDisposable>(new Handle());
            },
            NullLogger.Instance,
            CancellationToken.None));

        await Eventually.TrueAsync(() => Volatile.Read(ref started) == 1, "keep-alive requested at start because engine.keepAlive is on");
        await using var control = new NamedPipeClientStream(".", options.ControlPipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
        await control.ConnectAsync(10_000);
        using var reader = new StreamReader(control);
        await using var writer = new StreamWriter(control) { AutoFlush = true, NewLine = "\n" };

        await writer.WriteLineAsync("""{"cmd":"ping"}""");
        (await reader.ReadLineAsync())!.ShouldContain("pong");

        await using (var engineClient = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous))
        {
            await engineClient.ConnectAsync(10_000);
            await engineClient.WriteAsync(new byte[] { 1 });
            await engineClient.FlushAsync();
            var one = new byte[1];
            (await engineClient.ReadAsync(one).AsTask().WaitAsync(TimeSpan.FromSeconds(10))).ShouldBe(1);

            await writer.WriteLineAsync("""{"cmd":"status"}""");
            var status = (await reader.ReadLineAsync())!;
            status.ShouldContain("\"activeConnections\":1");
            status.ShouldContain("\"transport\":\"DialStdio\"");
        }

        await writer.WriteLineAsync("""{"cmd":"nonsense"}""");
        (await reader.ReadLineAsync())!.ShouldContain("unknown command");
        await writer.WriteLineAsync("not json");
        (await reader.ReadLineAsync())!.ShouldContain("invalid json");

        await writer.WriteLineAsync("""{"cmd":"shutdown"}""");
        (await reader.ReadLineAsync())!.ShouldContain("\"ok\":true");
        await host.WaitAsync(TimeSpan.FromSeconds(15));
        handles.Count.ShouldBe(0);
    }
}
