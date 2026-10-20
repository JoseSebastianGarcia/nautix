using System.Diagnostics;
using System.Text;

namespace Nautix.Spikes.S3;

/// <summary>Runs docker.exe (or any exe) with an isolated DOCKER_CONFIG and an explicit context, as Nautix itself will.</summary>
internal sealed class CliRunner(S3Options options)
{
    public ProcessStartInfo DockerStart(params string[] arguments)
    {
        var start = new ProcessStartInfo(options.DockerExe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        start.ArgumentList.Add("--context");
        start.ArgumentList.Add(options.Context);
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        if (options.DockerConfig.Length > 0)
        {
            start.Environment["DOCKER_CONFIG"] = options.DockerConfig;
        }

        return start;
    }

    public async Task<CliResult> DockerAsync(TimeSpan timeout, string? stdin, params string[] arguments)
    {
        using var process = Process.Start(DockerStart(arguments)) ?? throw new InvalidOperationException("docker did not start.");
        var clock = Stopwatch.StartNew();
        var output = new StringBuilder();
        var error = new StringBuilder();
        var outTask = Pump(process.StandardOutput, output);
        var errTask = Pump(process.StandardError, error);

        if (stdin is not null)
        {
            await process.StandardInput.WriteAsync(stdin);
        }

        process.StandardInput.Close();
        using var cancellation = new CancellationTokenSource(timeout);
        var timedOut = false;
        try
        {
            await process.WaitForExitAsync(cancellation.Token);
        }
        catch (OperationCanceledException)
        {
            timedOut = true;
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
        }

        await Task.WhenAll(outTask, errTask);
        return new CliResult(process.ExitCode, output.ToString(), error.ToString(), clock.Elapsed, timedOut);
    }

    public Task<CliResult> DockerAsync(TimeSpan timeout, params string[] arguments) => DockerAsync(timeout, null, arguments);

    private static async Task Pump(StreamReader reader, StringBuilder into)
    {
        var buffer = new char[4096];
        int read;
        while ((read = await reader.ReadAsync(buffer)) > 0)
        {
            lock (into)
            {
                into.Append(buffer, 0, read);
            }
        }
    }
}
