using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;

namespace Nautix.Spikes.S3;

/// <summary>Owns one Nautix.EngineRelay.exe child so the harness can restart or kill it, and talks to its control pipe.</summary>
internal sealed class RelayProcess(S3Options options, string transport = "dial-stdio", string? pipeName = null) : IDisposable
{
    private Process? _process;

    public string PipeName { get; } = pipeName ?? options.PipeName;

    public string ControlPipeName => PipeName == options.PipeName ? options.ControlPipeName : PipeName + "_control";

    public int ProcessId => _process?.Id ?? -1;

    public bool HasExited => _process is null || _process.HasExited;

    public async Task StartAsync()
    {
        var start = new ProcessStartInfo(options.RelayExe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
            RedirectStandardOutput = true,
        };
        foreach (var argument in new[]
        {
            "--pipe", PipeName,
            "--control-pipe", ControlPipeName,
            "--distro", options.Distro,
            "--transport", transport,
            "--mutex-name", @"Local\Nautix.EngineRelay.Spike." + PipeName,
        })
        {
            start.ArgumentList.Add(argument);
        }

        _process = Process.Start(start) ?? throw new InvalidOperationException("Relay did not start.");
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (_process.HasExited)
            {
                throw new InvalidOperationException($"Relay exited with code {_process.ExitCode}: {await _process.StandardError.ReadToEndAsync()}");
            }

            if (await TryAsync("""{"cmd":"ping"}""") is not null)
            {
                return;
            }

            await Task.Delay(100);
        }

        throw new TimeoutException("Relay did not answer on its control pipe within 10 s.");
    }

    public async Task<JsonDocument?> StatusAsync()
    {
        var reply = await TryAsync("""{"cmd":"status"}""");
        return reply is null ? null : JsonDocument.Parse(reply);
    }

    /// <summary>Asks the relay to stop and waits for the process to exit. Returns false if it did not exit in time.</summary>
    public async Task<bool> ShutdownAsync()
    {
        _ = await TryAsync("""{"cmd":"shutdown"}""");
        return _process is null || await WaitExitAsync(TimeSpan.FromSeconds(15));
    }

    public async Task<bool> KillAsync()
    {
        _process?.Kill(entireProcessTree: true);
        return _process is null || await WaitExitAsync(TimeSpan.FromSeconds(10));
    }

    public void Dispose()
    {
        if (_process is { HasExited: false })
        {
            _process.Kill(entireProcessTree: true);
        }

        _process?.Dispose();
    }

    private async Task<bool> WaitExitAsync(TimeSpan timeout)
    {
        using var cancellation = new CancellationTokenSource(timeout);
        try
        {
            await _process!.WaitForExitAsync(cancellation.Token);
            return true;
        }
        catch (OperationCanceledException)
        {
            return false;
        }
    }

    private async Task<string?> TryAsync(string request)
    {
        try
        {
            await using var client = new NamedPipeClientStream(".", ControlPipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            await client.ConnectAsync(1000);
            using var reader = new StreamReader(client);
            await using var writer = new StreamWriter(client) { AutoFlush = true, NewLine = "\n" };
            await writer.WriteLineAsync(request);
            return await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(5));
        }
        catch (Exception ex) when (ex is TimeoutException or IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }
}
