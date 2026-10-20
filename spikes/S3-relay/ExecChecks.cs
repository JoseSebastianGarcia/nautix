using System.Text;
using System.Text.RegularExpressions;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>docker exec -it through a real pseudo console: the interactive path (stdin, TTY, window-size updates) over the relay.</summary>
internal static partial class ExecChecks
{
    [GeneratedRegex(@"\x1B\[[0-9;?]*[ -/]*[@-~]|\x1B\][^\x07\x1B]*(\x07|\x1B\\)|\x1B[()][A-Za-z0-9]", RegexOptions.None, matchTimeoutMilliseconds: 1000)]
    private static partial Regex Ansi();

    public static async Task<CheckResult> ExecInteractiveWithResizeAsync(S3Context ctx)
    {
        const string Name = "exec -it: interactive shell and live resize through the relay";
        const string Gate = "prompt appears, stty size reports 24 80, then 30 100 after resizing the console, and the shell exits cleanly";
        var started = await ctx.Cli.DockerAsync(TimeSpan.FromMinutes(2), "run", "-d", "--name", "s3-sh", "alpine:3.20", "sleep", "600");
        if (!started.Succeeded)
        {
            return CheckResult.Create(Name, false, Gate, "could not start the container: " + started.StandardError.Trim());
        }

        if (ctx.Options.DockerConfig.Length > 0)
        {
            Environment.SetEnvironmentVariable("DOCKER_CONFIG", ctx.Options.DockerConfig);
        }

        var command = $"\"{ctx.Options.DockerExe}\" --context {ctx.Options.Context} exec -it s3-sh sh";
        using var session = ConPtySession.Start(command, 80, 24);
        var screen = new StringBuilder();
        var reader = Task.Run(async () =>
        {
            var buffer = new byte[8192];
            try
            {
                int read;
                while ((read = await session.Output.ReadAsync(buffer)) > 0)
                {
                    lock (screen)
                    {
                        screen.Append(Encoding.UTF8.GetString(buffer, 0, read));
                    }
                }
            }
            catch (IOException)
            {
                // Console closed.
            }
        });

        string Text()
        {
            lock (screen)
            {
                return Ansi().Replace(screen.ToString(), string.Empty);
            }
        }

        async Task<bool> WaitForAsync(Func<string, bool> condition, int seconds)
        {
            var deadline = DateTime.UtcNow.AddSeconds(seconds);
            while (DateTime.UtcNow < deadline)
            {
                if (condition(Text()))
                {
                    return true;
                }

                await Task.Delay(100);
            }

            return false;
        }

        var prompt = await WaitForAsync(t => t.Contains("/ #", StringComparison.Ordinal), 30);
        var initial = false;
        var resized = false;
        var exited = false;
        if (prompt)
        {
            session.Write("stty size\r");
            initial = await WaitForAsync(t => Regex.IsMatch(t, @"(?m)^\s*24 80\s*$", RegexOptions.None, TimeSpan.FromSeconds(1)), 10);

            session.Resize(100, 30);
            await Task.Delay(1500);
            session.Write("stty size\r");
            resized = await WaitForAsync(t => Regex.IsMatch(t, @"(?m)^\s*30 100\s*$", RegexOptions.None, TimeSpan.FromSeconds(1)), 10);

            session.Write("exit\r");
            using var exitWait = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            try
            {
                exited = await session.WaitForExitAsync(exitWait.Token) == 0;
            }
            catch (OperationCanceledException)
            {
                session.Kill();
            }
        }

        session.Dispose();
        await reader;
        var passed = prompt && initial && resized && exited;
        return CheckResult.Create(
            Name,
            passed,
            Gate,
            passed ? string.Empty : $"prompt={prompt} initialSize={initial} resize={resized} cleanExit={exited}. Tail of the console: {Text()[^Math.Min(300, Text().Length)..].Replace("\r", " ", StringComparison.Ordinal).Replace("\n", " ", StringComparison.Ordinal)}");
    }
}
