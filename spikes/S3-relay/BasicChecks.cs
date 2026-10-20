using Docker.DotNet.Models;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>Everyday traffic through the relay: unary API calls, the CLI, streaming logs and stdin half-close.</summary>
internal static class BasicChecks
{
    private static readonly TimeSpan _long = TimeSpan.FromMinutes(2);

    public static async Task<CheckResult> DockerDotNetAsync(S3Context ctx)
    {
        const string Name = "Docker.DotNet over the relay: version, pull, create/start/wait/logs, remove";
        const string Gate = "all API calls succeed through the named pipe";
        try
        {
            using var client = ctx.NewClient();
            var version = await client.System.GetVersionAsync();
            await client.Images.CreateImageAsync(new ImagesCreateParameters { FromImage = "alpine", Tag = "3.20" }, null, new Progress<JSONMessage>());

            var created = await client.Containers.CreateContainerAsync(new CreateContainerParameters { Image = "alpine:3.20", Name = "s3-api", Cmd = ["echo", "hello-from-api"] });
            _ = await client.Containers.StartContainerAsync(created.ID, new ContainerStartParameters());
            var exit = await client.Containers.WaitContainerAsync(created.ID);
            using var logs = await client.Containers.GetContainerLogsAsync(created.ID, new ContainerLogsParameters { ShowStdout = true }, CancellationToken.None);
            var (stdout, _) = await logs.ReadOutputToEndAsync(CancellationToken.None);
            await client.Containers.RemoveContainerAsync(created.ID, new ContainerRemoveParameters { Force = true });

            var passed = exit.StatusCode == 0 && stdout.Contains("hello-from-api", StringComparison.Ordinal);
            return CheckResult.Create(Name, passed, Gate, $"engine {version.Version}, API {version.APIVersion}; output '{stdout.Trim()}'");
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return CheckResult.Create(Name, false, Gate, ex.GetType().Name + ": " + ex.Message);
        }
    }

    public static async Task<CheckResult> CliBasicsAsync(S3Context ctx)
    {
        var version = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), "version", "--format", "{{.Server.Version}}");
        var ps = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), "ps", "-a");
        var info = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), "info", "--format", "{{.OperatingSystem}} / {{.Name}}");
        var passed = version.Succeeded && ps.Succeeded && info.Succeeded;
        return CheckResult.Create(
            "docker.exe through the relay: version, ps, info",
            passed,
            "all three exit 0",
            passed ? $"server {version.StandardOutput.Trim()}; {info.StandardOutput.Trim()}" : $"version={version.ExitCode} ps={ps.ExitCode} info={info.ExitCode}: {version.StandardError}{ps.StandardError}{info.StandardError}",
            ("psMs", ps.Elapsed.TotalMilliseconds));
    }

    public static async Task<CheckResult> LogsFollowAsync(S3Context ctx)
    {
        var started = await ctx.Cli.DockerAsync(_long, "run", "-d", "--name", "s3-ticker", "alpine:3.20", "sh", "-c", "i=0; while true; do echo tick-$i; i=$((i+1)); sleep 0.2; done");
        if (!started.Succeeded)
        {
            return CheckResult.Create("logs -f streams (CLI and API)", false, ">= 12 lines within 10 s on each", "could not start the ticker container: " + started.StandardError);
        }

        var cliLines = 0;
        var cliClock = System.Diagnostics.Stopwatch.StartNew();
        using (var process = System.Diagnostics.Process.Start(ctx.Cli.DockerStart("logs", "-f", "s3-ticker"))!)
        {
            using var cancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            try
            {
                while (cliLines < 12 && await process.StandardOutput.ReadLineAsync(cancellation.Token) is not null)
                {
                    cliLines++;
                }
            }
            catch (OperationCanceledException)
            {
                // Not enough lines in time: reported below.
            }

            process.Kill(entireProcessTree: true);
        }

        var apiLines = 0;
        using var client = ctx.NewClient();
        using var apiCancellation = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try
        {
            using var stream = await client.Containers.GetContainerLogsAsync("s3-ticker", new ContainerLogsParameters { ShowStdout = true, Follow = true, Tail = "0" }, apiCancellation.Token);
            var buffer = new byte[4096];
            while (apiLines < 12)
            {
                var read = await stream.ReadOutputAsync(buffer, 0, buffer.Length, apiCancellation.Token);
                if (read.EOF)
                {
                    break;
                }

                apiLines += buffer.Take(read.Count).Count(b => b == (byte)'\n');
            }
        }
        catch (OperationCanceledException)
        {
            // Reported below.
        }

        var passed = cliLines >= 12 && apiLines >= 12;
        return CheckResult.Create(
            "logs -f streams (CLI and API)",
            passed,
            ">= 12 lines within 10 s on each",
            string.Empty,
            ("cliLines", cliLines),
            ("cliSeconds", cliClock.Elapsed.TotalSeconds),
            ("apiLines", apiLines));
    }

    public static async Task<CheckResult> HalfCloseAsync(S3Context ctx)
    {
        // 'docker run -i' only terminates if the relay propagates the client's write-shutdown to the engine (message-mode pipe).
        const string Gate = "echo returned in full and the command exited within 30 s";
        var small = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(30), "hello-nautix\n", "run", "-i", "--rm", "alpine:3.20", "cat");
        var payload = string.Concat(Enumerable.Range(0, 100_000).Select(i => $"line-{i:D6}\n"));
        var large = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), payload, "run", "-i", "--rm", "alpine:3.20", "cat");

        var smallOk = small.Succeeded && small.StandardOutput.Trim() == "hello-nautix";
        var largeOk = large.Succeeded && large.StandardOutput.Length == payload.Length;
        return CheckResult.Create(
            "stdin half-close: echo piped into 'docker run -i … cat'",
            smallOk && largeOk,
            Gate,
            smallOk && largeOk ? string.Empty : $"small: exit={small.ExitCode} timedOut={small.TimedOut}; large: exit={large.ExitCode} timedOut={large.TimedOut} received {large.StandardOutput.Length} of {payload.Length} chars",
            ("smallSeconds", small.Elapsed.TotalSeconds),
            ("largeSeconds", large.Elapsed.TotalSeconds));
    }
}
