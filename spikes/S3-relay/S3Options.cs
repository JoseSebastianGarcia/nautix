namespace Nautix.Spikes.S3;

/// <summary>Command line of the harness; Run-S3.ps1 fills these in.</summary>
internal sealed record S3Options(
    string PipeName,
    string ControlPipeName,
    string Distro,
    string DockerExe,
    string DockerConfig,
    string Context,
    string RelayExe,
    string OutputDirectory,
    int BigImageMiB,
    bool SkipBig)
{
    public string NpipeUri => $"npipe://./pipe/{PipeName}";

    public static S3Options Parse(string[] args)
    {
        string Value(string name, string fallback)
        {
            var index = Array.IndexOf(args, name);
            return index >= 0 && index + 1 < args.Length ? args[index + 1] : fallback;
        }

        return new S3Options(
            Value("--pipe", "nautix_engine_spike"),
            Value("--control-pipe", "nautix_relay_control_spike"),
            Value("--distro", "nautix-engine-spike"),
            Value("--docker", "docker"),
            Value("--docker-config", string.Empty),
            Value("--context", "nautix-spike"),
            Value("--relay-exe", "Nautix.EngineRelay.exe"),
            Value("--out", Path.Combine(AppContext.BaseDirectory, "results")),
            int.Parse(Value("--big-mib", "1024"), System.Globalization.CultureInfo.InvariantCulture),
            args.Contains("--skip-big", StringComparer.Ordinal));
    }
}
