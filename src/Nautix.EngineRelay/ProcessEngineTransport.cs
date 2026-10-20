using System.Diagnostics;
using System.IO.Pipelines;

namespace Nautix.EngineRelay;

/// <summary>Runs a command whose stdin/stdout are a byte pipe to the engine socket (wsl.exe ... dial-stdio, or socat).</summary>
public sealed class ProcessEngineTransport(string fileName, IReadOnlyList<string> arguments) : IEngineTransport
{
    public static ProcessEngineTransport DialStdio(string distro) =>
        new("wsl.exe", ["-d", distro, "--exec", "docker", "system", "dial-stdio"]);

    public static ProcessEngineTransport Socat(string distro) =>
        new("wsl.exe", ["-d", distro, "--exec", "socat", "-", "UNIX-CONNECT:/var/run/docker.sock"]);

    public static IEngineTransport For(RelayOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        return options.Transport switch
        {
            EngineTransportKind.DialStdio => DialStdio(options.Distro),
            EngineTransportKind.Socat => Socat(options.Distro),
            _ => throw new ArgumentOutOfRangeException(nameof(options), options.Transport, null),
        };
    }

    public ValueTask<EngineConnection> OpenAsync(CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var start = new ProcessStartInfo(fileName)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        var process = Process.Start(start) ?? throw new InvalidOperationException($"Could not start {fileName}.");

        // Drain stderr so a chatty child can never block on a full pipe; its content is never logged (no payloads).
        _ = process.StandardError.BaseStream.CopyToAsync(Stream.Null, CancellationToken.None);

        var reader = PipeReader.Create(process.StandardOutput.BaseStream, new StreamPipeReaderOptions(bufferSize: 65536, minimumReadSize: 16384, leaveOpen: true));
        var writer = PipeWriter.Create(process.StandardInput.BaseStream, new StreamPipeWriterOptions(minimumBufferSize: 65536, leaveOpen: true));
#pragma warning disable CA2000 // Ownership of the connection (and its process lifetime) passes to the caller, which disposes it.
        return ValueTask.FromResult(new EngineConnection(reader, writer, new ProcessLifetime(process)));
#pragma warning restore CA2000
    }

    private sealed class ProcessLifetime(Process process) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                if (!process.HasExited)
                {
                    process.Kill(entireProcessTree: true);
                    await process.WaitForExitAsync(CancellationToken.None).ConfigureAwait(false);
                }
            }
            catch (InvalidOperationException)
            {
                // Already gone.
            }
            finally
            {
                process.Dispose();
            }
        }
    }
}
