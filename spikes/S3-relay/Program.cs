using System.Collections.Immutable;
using Nautix.Spikes.Common;
using Nautix.Spikes.S3;

// S3 — Relay spike harness. Run via Run-S3.ps1 (it publishes the relay, creates the docker context, then calls this).
var options = S3Options.Parse(args);
Directory.CreateDirectory(options.OutputDirectory);
if (options.DockerConfig.Length > 0)
{
    Environment.SetEnvironmentVariable("DOCKER_CONFIG", options.DockerConfig);
}

var cli = new CliRunner(options);
using var relay = new RelayProcess(options);
var context = new S3Context(options, cli, relay);
var checks = ImmutableArray.CreateBuilder<CheckResult>();

async Task Run(Func<S3Context, Task<CheckResult>> check)
{
    try
    {
        var result = await check(context);
        checks.Add(result);
        Console.WriteLine($"[{(result.Passed ? "PASS" : "FAIL")}] {result.Name}");
    }
    catch (Exception ex) when (ex is not OutOfMemoryException)
    {
        checks.Add(CheckResult.Create("harness error", false, "check ran", ex.ToString()));
        Console.WriteLine("[FAIL] harness error: " + ex.Message);
    }
}

try
{
    await relay.StartAsync();
    var reachable = await cli.DockerAsync(TimeSpan.FromSeconds(60), "version", "--format", "{{.Server.Version}}");
    if (!reachable.Succeeded)
    {
        await Console.Error.WriteLineAsync($"The engine is not reachable through the relay (docker exit {reachable.ExitCode}): {reachable.StandardError}");
        await Console.Error.WriteLineAsync($"Check that distro '{options.Distro}' is provisioned (Provision-SpikeDistro.ps1) and that docker context '{options.Context}' points at npipe:////./pipe/{options.PipeName}.");
        return 2;
    }

    await context.CleanupAsync();
    await Run(BasicChecks.CliBasicsAsync);
    await Run(BasicChecks.DockerDotNetAsync);
    await Run(BasicChecks.LogsFollowAsync);
    await Run(BasicChecks.HalfCloseAsync);
    await Run(ExecChecks.ExecInteractiveWithResizeAsync);
    await Run(BuildChecks.BuildAsync);
    if (!options.SkipBig)
    {
        await Run(ThroughputChecks.SaveLoadAsync);
    }

    await Run(ConcurrencyChecks.HundredConnectionsAsync);
    await Run(LifecycleChecks.NoTcpListenerAsync);
    await Run(LifecycleChecks.PipeAclAsync);
    await Run(LifecycleChecks.SocatFallbackAsync);
    await Run(LifecycleChecks.RestartAsync);
}
finally
{
    try
    {
        await context.CleanupAsync();
    }
    catch (Exception ex) when (ex is not OutOfMemoryException)
    {
        await Console.Error.WriteLineAsync("Cleanup failed: " + ex.Message);
    }

    _ = await relay.ShutdownAsync();
}

var report = new SpikeReport("S3-relay", DateTimeOffset.Now, MachineInfo.Capture(), checks.ToImmutable());
await report.SaveAsync(options.OutputDirectory, CancellationToken.None);
await File.WriteAllTextAsync(Path.Combine(options.OutputDirectory, "s3-summary.txt"), report.ToConsoleText());
Console.WriteLine(report.ToConsoleText());
return report.AllPassed ? 0 : 1;
