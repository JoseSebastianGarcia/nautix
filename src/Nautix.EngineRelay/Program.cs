using System.Runtime.InteropServices;
using Nautix.EngineRelay;

// Exit codes: 0 stopped normally, 2 bad arguments, 3 another relay already runs for this user, 4 could not listen.
var parsed = RelayArguments.Parse(args);
if (parsed.IsFailure)
{
    await Console.Error.WriteLineAsync(parsed.Error.Message);
    return 2;
}

var options = parsed.Value;
using var instance = SingleInstance.TryAcquire(options.MutexName);
if (instance is null)
{
    await Console.Error.WriteLineAsync("Nautix.EngineRelay is already running for this user.");
    return 3;
}

var logDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nautix", "logs");
using var logger = new RollingFileLogger(logDirectory);
IPipeServerFactory pipes = OperatingSystem.IsWindows() ? new WindowsPipeServerFactory() : new PortablePipeServerFactory();

using var shutdown = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    shutdown.Cancel();
};
using var sigterm = PosixSignalRegistration.Create(PosixSignal.SIGTERM, _ => shutdown.Cancel());

var transport = ProcessEngineTransport.For(options);
async ValueTask<IAsyncDisposable> StartKeepAlive(CancellationToken ct) =>
    await new ProcessEngineTransport("wsl.exe", ["-d", options.Distro, "--exec", "sleep", "infinity"]).OpenAsync(ct);

try
{
    await RelayHost.RunAsync(options, pipes, transport, StartKeepAlive, logger, shutdown.Token);
    return 0;
}
catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
{
    RelayLog.ListenFailed(logger, ex);
    await Console.Error.WriteLineAsync("Could not listen on the engine pipe: " + ex.Message);
    return 4;
}
