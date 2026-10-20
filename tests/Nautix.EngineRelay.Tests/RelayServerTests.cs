using System.Diagnostics;
using System.IO.Pipes;
using Shouldly;

namespace Nautix.EngineRelay.Tests;

public sealed class RelayServerTests
{
    private static async Task<byte[]> RoundTripAsync(NamedPipeClientStream client, byte[] payload)
    {
        var received = new byte[payload.Length];
        var reading = Task.Run(async () =>
        {
            var offset = 0;
            while (offset < received.Length)
            {
                var read = await client.ReadAsync(received.AsMemory(offset));
                if (read == 0)
                {
                    break;
                }

                offset += read;
            }

            return offset;
        });
        await client.WriteAsync(payload);
        await client.FlushAsync();
        var count = await reading.WaitAsync(TimeSpan.FromSeconds(30));
        return received[..count];
    }

    [Fact]
    public async Task A_client_gets_its_bytes_echoed_through_the_engine()
    {
        await using var relay = new RunningRelay();
        await using var client = await relay.ConnectAsync();

        var echoed = await RoundTripAsync(client, TestData.Random(100_000, 3));

        TestData.Hash(echoed).ShouldBe(TestData.Hash(TestData.Random(100_000, 3)));
    }

    [Fact]
    public async Task Serves_one_hundred_concurrent_connections_each_with_its_own_engine_link()
    {
        const int Clients = 100;
        var engine = new LoopbackEngineTransport();
        await using var relay = new RunningRelay(engine);
        var allConnected = new TaskCompletionSource();
        var proceed = new TaskCompletionSource();
        var connected = 0;

        var tasks = Enumerable.Range(0, Clients).Select(i => Task.Run(async () =>
        {
            await using var client = await relay.ConnectAsync();
            if (Interlocked.Increment(ref connected) == Clients)
            {
                allConnected.SetResult();
            }

            await allConnected.Task.WaitAsync(TimeSpan.FromSeconds(30));
            await proceed.Task.WaitAsync(TimeSpan.FromSeconds(60));
            var payload = TestData.Random(262_144, i);
            var echoed = await RoundTripAsync(client, payload);
            return TestData.Hash(echoed) == TestData.Hash(payload);
        })).ToArray();

        try
        {
            await Eventually.TrueAsync(() => relay.Server.ActiveConnections == Clients, "100 connections active at the same time");
        }
        catch (TimeoutException ex)
        {
            var faults = tasks.Where(t => t.IsFaulted).Select(t => t.Exception!.GetBaseException().GetType().Name + ": " + t.Exception.GetBaseException().Message).Distinct().ToList();
            throw new TimeoutException($"{ex.Message} | connected={Volatile.Read(ref connected)} active={relay.Server.ActiveConnections} total={relay.Server.TotalConnections} opened={engine.Opened} faulted={tasks.Count(t => t.IsFaulted)} [{string.Join("; ", faults)}]");
        }
        proceed.SetResult();
        var results = await Task.WhenAll(tasks);

        results.ShouldAllBe(ok => ok);
        await Eventually.TrueAsync(() => relay.Server.ActiveConnections == 0, "all connections released");
        relay.Server.TotalConnections.ShouldBe(Clients);
        await Eventually.TrueAsync(() => engine.Disposed == Clients, "every engine link released");
        engine.Opened.ShouldBe(Clients);
    }

    [Fact]
    public async Task Restarting_the_relay_does_not_break_new_connections()
    {
        var name = TestData.UniquePipeName();
        var first = new RunningRelay(pipeName: name);
        await using (var client = await first.ConnectAsync())
        {
            (await RoundTripAsync(client, [1, 2, 3])).ShouldBe([1, 2, 3]);
        }

        await first.DisposeAsync();

        await using var second = new RunningRelay(pipeName: name);
        await using var again = await second.ConnectAsync();
        (await RoundTripAsync(again, [4, 5, 6])).ShouldBe([4, 5, 6]);
    }

    [Fact]
    public async Task An_unreachable_engine_closes_that_client_and_the_relay_keeps_serving()
    {
        var failing = new SwitchableTransport(new LoopbackEngineTransport(openFailure: new InvalidOperationException("engine down")));
        await using var relay = new RunningRelay(failing);

        await using (var client = await relay.ConnectAsync())
        {
            var buffer = new byte[16];
            var read = await client.ReadAsync(buffer).AsTask().WaitAsync(TimeSpan.FromSeconds(10));
            read.ShouldBe(0, "the client must see the connection close, not hang");
        }

        failing.Use(new LoopbackEngineTransport());
        await using var healthy = await relay.ConnectAsync();
        (await RoundTripAsync(healthy, [9, 9])).ShouldBe([9, 9]);
        await Eventually.TrueAsync(() => relay.Server.ActiveConnections <= 1, "failed connection released");
    }

    [Fact]
    public async Task Connection_count_changes_are_announced()
    {
        await using var relay = new RunningRelay();
        var changes = 0;
        relay.Server.ConnectionCountChanged += (_, _) => Interlocked.Increment(ref changes);

        await using (var client = await relay.ConnectAsync())
        {
            (await RoundTripAsync(client, [1])).ShouldBe([1]);
        }

        await Eventually.TrueAsync(() => Volatile.Read(ref changes) >= 2 && relay.Server.ActiveConnections == 0, "connect and disconnect both reported");
    }

    [Fact]
    public async Task Stopping_the_relay_releases_clients_that_are_still_connected()
    {
        var engine = new LoopbackEngineTransport();
        var relay = new RunningRelay(engine);
        await using var client = await relay.ConnectAsync();
        await Eventually.TrueAsync(() => relay.Server.ActiveConnections == 1, "client active");

        var clock = Stopwatch.StartNew();
        await relay.StopAsync();

        clock.Elapsed.ShouldBeLessThan(TimeSpan.FromSeconds(10));
        await Eventually.TrueAsync(() => engine.Disposed == 1, "engine link released on shutdown");
        await relay.DisposeAsync();
    }

    private sealed class SwitchableTransport(IEngineTransport initial) : IEngineTransport
    {
        private IEngineTransport _current = initial;

        public void Use(IEngineTransport next) => Volatile.Write(ref _current, next);

        public ValueTask<EngineConnection> OpenAsync(CancellationToken ct) => Volatile.Read(ref _current).OpenAsync(ct);
    }
}
