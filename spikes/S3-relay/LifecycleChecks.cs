using System.Diagnostics;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>Relay restart/kill, the socat fallback transport, and the "no listeners / user-only ACL" security requirements.</summary>
internal static class LifecycleChecks
{
    public static async Task<CheckResult> RestartAsync(S3Context ctx)
    {
        const string Name = "relay restart and kill -9 do not break new connections";
        const string Gate = "after a graceful stop and after a hard kill, a restarted relay serves docker.exe and Docker.DotNet again";
        var steps = new List<string>();

        async Task<bool> WorksAsync(string label)
        {
            var cli = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), "ps");
            bool api;
            try
            {
                using var client = ctx.NewClient();
                await client.System.PingAsync();
                api = true;
            }
            catch (Exception ex) when (ex is not OutOfMemoryException)
            {
                api = false;
            }

            steps.Add($"{label}: cli={cli.Succeeded} api={api}");
            return cli.Succeeded && api;
        }

        var before = await WorksAsync("before");
        var graceful = await ctx.Relay.ShutdownAsync();
        steps.Add($"graceful shutdown exited={graceful}");
        var downClock = Stopwatch.StartNew();
        var whileDown = await ctx.Cli.DockerAsync(TimeSpan.FromSeconds(60), "ps");
        steps.Add($"docker ps while the relay is down: exit={whileDown.ExitCode} after {downClock.Elapsed.TotalSeconds:0.0}s (must fail fast, not hang)");
        await ctx.Relay.StartAsync();
        var afterGraceful = await WorksAsync("after graceful restart");

        var killed = await ctx.Relay.KillAsync();
        steps.Add($"kill exited={killed}");
        await ctx.Relay.StartAsync();
        var afterKill = await WorksAsync("after kill -9 and restart");

        var passed = before && graceful && afterGraceful && killed && afterKill && !whileDown.TimedOut;
        return CheckResult.Create(Name, passed, Gate, string.Join(" | ", steps), ("downFailSeconds", downClock.Elapsed.TotalSeconds));
    }

    public static async Task<CheckResult> SocatFallbackAsync(S3Context ctx)
    {
        const string Name = "fallback transport: socat instead of docker system dial-stdio";
        const string Gate = "a second relay using socat answers a Docker.DotNet ping and lists containers";
        using var socat = new RelayProcess(ctx.Options, "socat", ctx.Options.PipeName + "_socat");
        try
        {
            await socat.StartAsync();
            using var client = ctx.NewClient(socat.PipeName);
            await client.System.PingAsync();
            _ = await client.Containers.ListContainersAsync(new Docker.DotNet.Models.ContainersListParameters { All = true });
            return CheckResult.Create(Name, true, Gate);
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return CheckResult.Create(Name, false, Gate, ex.GetType().Name + ": " + ex.Message + " (is socat installed in the distro?)");
        }
        finally
        {
            _ = await socat.ShutdownAsync();
        }
    }

    public static async Task<CheckResult> NoTcpListenerAsync(S3Context ctx)
    {
        const string Name = "no TCP listener owned by the relay (docs/spec/06, security requirement 1)";
        var start = new ProcessStartInfo("netstat.exe", "-ano -p TCP") { RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true };
        using var process = Process.Start(start)!;
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        var pid = ctx.Relay.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture);
        var listeners = output.Split('\n')
            .Where(l => l.Contains("LISTENING", StringComparison.Ordinal) && l.TrimEnd().EndsWith(" " + pid, StringComparison.Ordinal))
            .Select(l => l.Trim())
            .ToList();
        return CheckResult.Create(Name, listeners.Count == 0, "no LISTENING TCP socket for the relay PID", string.Join("; ", listeners), ("relayPid", ctx.Relay.ProcessId), ("listeners", listeners.Count));
    }

    public static async Task<CheckResult> PipeAclAsync(S3Context ctx)
    {
        const string Name = "engine pipe ACL grants the current user only";
        const string Gate = "exactly one ACE: Allow, current user SID (denial for a second user is manual)";
        try
        {
            await using var client = new NamedPipeClientStream(".", ctx.Options.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            await client.ConnectAsync(5000);
            var rules = client.GetAccessControl().GetAccessRules(true, false, typeof(SecurityIdentifier)).Cast<PipeAccessRule>().ToList();
            using var identity = WindowsIdentity.GetCurrent();
            var passed = rules.Count == 1 && rules[0].AccessControlType == AccessControlType.Allow && rules[0].IdentityReference == identity.User;
            return CheckResult.Create(Name, passed, Gate, string.Join("; ", rules.Select(r => $"{r.AccessControlType} {r.IdentityReference} {r.PipeAccessRights}")), ("aceCount", rules.Count));
        }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        {
            return CheckResult.Create(Name, false, Gate, ex.GetType().Name + ": " + ex.Message);
        }
    }
}
