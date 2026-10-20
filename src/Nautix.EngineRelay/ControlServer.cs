using System.IO.Pipes;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>
/// Health/control channel on a second pipe: one JSON object per line in, one per line out.
/// Commands: <c>ping</c>, <c>status</c>, <c>shutdown</c>. Same ACL as the engine pipe.
/// </summary>
public sealed class ControlServer(RelayOptions options, IPipeServerFactory pipes, RelayServer relay, Action requestShutdown, ILogger logger)
{
    public async Task RunAsync(CancellationToken ct)
    {
        var first = true;
        while (!ct.IsCancellationRequested)
        {
            var server = pipes.Create(options.ControlPipeName, PipeKind.Byte, firstInstance: first);
            first = false;
            try
            {
                await server.WaitForConnectionAsync(ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                await server.DisposeAsync().ConfigureAwait(false);
                return;
            }

            _ = ServeAsync(server, ct);
        }
    }

    private async Task ServeAsync(NamedPipeServerStream stream, CancellationToken ct)
    {
        await using (stream.ConfigureAwait(false))
        {
            try
            {
                using var reader = new StreamReader(stream, leaveOpen: true);
                await using var writer = new StreamWriter(stream, leaveOpen: true) { AutoFlush = true, NewLine = "\n" };
                while (await reader.ReadLineAsync(ct).ConfigureAwait(false) is { } line)
                {
                    await writer.WriteLineAsync(Handle(line)).ConfigureAwait(false);
                }
            }
            catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException)
            {
                // Client left or relay is stopping.
            }
        }
    }

    private string Handle(string line)
    {
        string command;
        try
        {
            using var document = JsonDocument.Parse(line);
            command = document.RootElement.TryGetProperty("cmd", out var value) ? value.GetString() ?? string.Empty : string.Empty;
        }
        catch (JsonException)
        {
            return Serialize(new { ok = false, error = "invalid json" });
        }

        RelayLog.ControlCommand(logger, command);
        switch (command)
        {
            case "ping":
                return Serialize(new { ok = true, reply = "pong" });
            case "status":
                return Serialize(new
                {
                    ok = true,
                    pid = Environment.ProcessId,
                    version = typeof(ControlServer).Assembly.GetName().Version?.ToString(),
                    uptimeSeconds = (long)(DateTimeOffset.UtcNow - relay.StartedAt).TotalSeconds,
                    activeConnections = relay.ActiveConnections,
                    totalConnections = relay.TotalConnections,
                    transport = options.Transport.ToString(),
                    distro = options.Distro,
                    keepAlive = options.KeepAlive,
                });
            case "shutdown":
                requestShutdown();
                return Serialize(new { ok = true });
            default:
                return Serialize(new { ok = false, error = "unknown command" });
        }
    }

    private static string Serialize(object value) => JsonSerializer.Serialize(value);
}
