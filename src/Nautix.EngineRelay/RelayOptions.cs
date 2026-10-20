namespace Nautix.EngineRelay;

/// <summary>Settings of one relay instance. Defaults follow docs/spec/02-engine.md.</summary>
public sealed record RelayOptions
{
    public string PipeName { get; init; } = "nautix_engine";

    public string ControlPipeName { get; init; } = "nautix_relay_control";

    public string Distro { get; init; } = "nautix-engine";

    public EngineTransportKind Transport { get; init; } = EngineTransportKind.DialStdio;

    /// <summary>
    /// Keep the distro alive even with no clients (setting <c>engine.keepAlive</c>). Defaults to true: when WSL stops an idle
    /// distro, detached containers die with it (see ADR-014).
    /// </summary>
    public bool KeepAlive { get; init; } = true;

    public string MutexName { get; init; } = @"Local\Nautix.EngineRelay";

    /// <summary>Concurrent accept loops; more than one so a pending listener always exists while another connection is being set up.</summary>
    public int AcceptLoops { get; init; } = 4;
}
