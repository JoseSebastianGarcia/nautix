namespace Nautix.Spikes.S3;

internal sealed record CliResult(int ExitCode, string StandardOutput, string StandardError, TimeSpan Elapsed, bool TimedOut)
{
    public bool Succeeded => ExitCode == 0 && !TimedOut;
}
