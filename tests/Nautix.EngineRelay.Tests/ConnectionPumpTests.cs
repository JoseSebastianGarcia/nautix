using System.Diagnostics;
using Shouldly;

namespace Nautix.EngineRelay.Tests;

public sealed class ConnectionPumpTests
{
    private static readonly TimeSpan _timeout = TimeSpan.FromSeconds(30);

    [Fact]
    public async Task Bytes_sent_by_the_client_come_back_from_the_engine()
    {
        var engine = new LoopbackEngineTransport();
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        var pump = ConnectionPump.RunAsync(client.Relay, connection, CancellationToken.None);

        await client.ToRelay.WriteAsync("hello engine"u8.ToArray());
        await client.ToRelay.CompleteAsync();
        var echoed = await TestData.ReadAllAsync(client.FromRelay).WaitAsync(_timeout);
        await pump.WaitAsync(_timeout);

        System.Text.Encoding.UTF8.GetString(echoed).ShouldBe("hello engine");
    }

    [Fact]
    public async Task Half_close_from_the_client_still_delivers_the_whole_response()
    {
        // The client finishes writing first (docker run -i with a file piped in); the engine answers after seeing EOF.
        var engine = new LoopbackEngineTransport();
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        var pump = ConnectionPump.RunAsync(client.Relay, connection, CancellationToken.None);
        var payload = TestData.Random(2_000_000, 1);

        // Like a real client, read while writing: with finite buffers an echo peer would otherwise deadlock the test itself.
        var reading = TestData.ReadAllAsync(client.FromRelay);
        await client.ToRelay.WriteAsync(payload).AsTask().WaitAsync(_timeout);
        await client.ToRelay.CompleteAsync();
        var echoed = await reading.WaitAsync(_timeout);

        echoed.Length.ShouldBe(payload.Length);
        TestData.Hash(echoed).ShouldBe(TestData.Hash(payload));
        await pump.WaitAsync(_timeout);
    }

    [Fact]
    public async Task Large_transfer_keeps_every_byte_in_order()
    {
        var engine = new LoopbackEngineTransport();
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        var pump = ConnectionPump.RunAsync(client.Relay, connection, CancellationToken.None);
        var reading = TestData.ReadAllAsync(client.FromRelay);
        var chunk = TestData.Random(1_000_000, 2);
        const int Chunks = 64;

        var clock = Stopwatch.StartNew();
        var writing = Task.Run(async () =>
        {
            for (var i = 0; i < Chunks; i++)
            {
                await client.ToRelay.WriteAsync(chunk).AsTask().WaitAsync(_timeout);
            }

            await client.ToRelay.CompleteAsync();
        });
        var echoed = await reading.WaitAsync(_timeout);
        await writing.WaitAsync(_timeout);
        await pump.WaitAsync(_timeout);

        echoed.Length.ShouldBe(chunk.Length * Chunks);
        for (var i = 0; i < Chunks; i++)
        {
            echoed.AsSpan(i * chunk.Length, chunk.Length).SequenceEqual(chunk).ShouldBeTrue($"chunk {i} differs");
        }

        // Sanity floor only: this is an in-memory loopback, not the S3 throughput measurement.
        (chunk.Length * (long)Chunks / 1_000_000.0 / clock.Elapsed.TotalSeconds).ShouldBeGreaterThan(20);
    }

    [Fact]
    public async Task Engine_closing_first_ends_the_pump_even_if_the_client_keeps_its_end_open()
    {
        var engine = new LoopbackEngineTransport(closeAfterBytes: 5);
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        var pump = ConnectionPump.RunAsync(client.Relay, connection, CancellationToken.None);

        await client.ToRelay.WriteAsync("0123456789"u8.ToArray());
        var echoed = await TestData.ReadAllAsync(client.FromRelay).WaitAsync(_timeout);
        await pump.WaitAsync(_timeout);

        System.Text.Encoding.UTF8.GetString(echoed).ShouldBe("01234");
    }

    [Fact]
    public async Task Client_disappearing_ends_the_pump()
    {
        var engine = new LoopbackEngineTransport();
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        var pump = ConnectionPump.RunAsync(client.Relay, connection, CancellationToken.None);

        await client.ToRelay.WriteAsync("x"u8.ToArray());
        await client.FromRelay.CompleteAsync();
        await client.ToRelay.CompleteAsync();

        await pump.WaitAsync(_timeout);
    }

    [Fact]
    public async Task Cancellation_stops_a_pump_that_is_waiting_for_data()
    {
        var engine = new LoopbackEngineTransport();
        var client = new ClientPipe();
        await using var connection = await engine.OpenAsync(CancellationToken.None);
        using var cancellation = new CancellationTokenSource();
        var pump = ConnectionPump.RunAsync(client.Relay, connection, cancellation.Token);

        await Task.Delay(100);
        await cancellation.CancelAsync();

        await Should.ThrowAsync<OperationCanceledException>(() => pump.WaitAsync(_timeout));
    }
}
