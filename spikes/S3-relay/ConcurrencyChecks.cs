using Docker.DotNet.Models;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>100 simultaneous client connections, each with a long-lived events stream plus a unary call on a second connection.</summary>
internal static class ConcurrencyChecks
{
    private const int Clients = 100;

    public static async Task<CheckResult> HundredConnectionsAsync(S3Context ctx)
    {
        var clients = Enumerable.Range(0, Clients).Select(_ => ctx.NewClient()).ToList();
        using var hold = new CancellationTokenSource(TimeSpan.FromSeconds(12));
        var streamFailures = 0;
        var listFailures = 0;
        var listed = 0;
        var maxActive = 0;

        try
        {
            var streams = clients.Select(client => Task.Run(async () =>
            {
                try
                {
                    await client.System.MonitorEventsAsync(new ContainerEventsParameters(), new Progress<Message>(), hold.Token);
                }
                catch (OperationCanceledException)
                {
                    // Expected when the hold time ends.
                }
                catch (Exception ex) when (ex is not OutOfMemoryException)
                {
                    Interlocked.Increment(ref streamFailures);
                }
            })).ToArray();

            await Task.Delay(TimeSpan.FromSeconds(2));
            var lists = clients.Select(client => Task.Run(async () =>
            {
                try
                {
                    _ = await client.Containers.ListContainersAsync(new ContainersListParameters { All = true });
                    Interlocked.Increment(ref listed);
                }
                catch (Exception ex) when (ex is not OutOfMemoryException)
                {
                    Interlocked.Increment(ref listFailures);
                }
            })).ToArray();

            var poll = Task.Run(async () =>
            {
                while (!hold.IsCancellationRequested)
                {
                    using var status = await ctx.Relay.StatusAsync();
                    if (status is not null)
                    {
                        maxActive = Math.Max(maxActive, status.RootElement.GetProperty("activeConnections").GetInt32());
                    }

                    await Task.Delay(200);
                }
            });

            await Task.WhenAll(lists);
            await Task.Delay(TimeSpan.FromSeconds(3));
            await hold.CancelAsync();
            await Task.WhenAll(streams);
            await poll;
        }
        finally
        {
            foreach (var client in clients)
            {
                client.Dispose();
            }
        }

        var passed = streamFailures == 0 && listFailures == 0 && listed == Clients && maxActive >= Clients;
        return CheckResult.Create(
            "100 concurrent connections (events stream + unary call each)",
            passed,
            "0 failures and the relay reports >= 100 active connections at once",
            string.Empty,
            ("clients", Clients),
            ("streamFailures", streamFailures),
            ("listFailures", listFailures),
            ("listSucceeded", listed),
            ("maxActiveConnectionsSeen", maxActive));
    }
}
