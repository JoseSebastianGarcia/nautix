using System.Collections.Immutable;
using System.Diagnostics;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S4;

internal sealed record SelfTestOptions(string? Distro, string? DockerContext, string DockerExe, string OutputDirectory, bool Screenshots);

/// <summary>
/// Drives a real shell through ConPTY and asserts on what xterm.js actually shows (its buffer), so
/// "renders correctly" is verified for text, resize, alternate-screen apps and docker exec -it, not just eyeballed.
/// </summary>
internal sealed class SelfTest(TerminalBridge bridge, Action<Nautix.Ui.Theming.ThemeMode> setTheme, SelfTestOptions options)
{
    private static readonly string _powerShellCommand =
        $"\"{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe")}\" -NoLogo -NoProfile";

    public async Task<SpikeReport> RunAsync()
    {
        Directory.CreateDirectory(options.OutputDirectory);
        var checks = ImmutableArray.CreateBuilder<CheckResult>();

        bridge.ApplyTheme(TerminalTheme.FromTokens());
        bridge.Start(_powerShellCommand);
        await WaitAsync(d => d.Lines.Any(l => l.StartsWith("PS ", StringComparison.Ordinal)), TimeSpan.FromSeconds(20));

        checks.Add(await ShellEchoAsync());
        checks.Add(await UnicodeAsync());
        checks.Add(await ResizeAsync());
        checks.Add(await ThemeAsync());
        checks.Add(options.Distro is null
            ? CheckResult.Skip("Full-screen app (vim) renders and exits cleanly", "alternate screen entered/left, '~' filler, insert mode text visible", "run with -Distro <name>")
            : await VimAsync());
        checks.Add(options.Distro is null
            ? CheckResult.Skip("Output flood: 300000 lines", "completes in <= 10 s and the page stays responsive", "run with -Distro <name>")
            : await FloodAsync());
        checks.Add(options.DockerContext is null
            ? CheckResult.Skip("docker exec -it through the relay (shell, resize, vi)", "interactive shell works, stty size follows resize, full-screen vi renders", "run with -DockerContext <name>")
            : await DockerExecAsync());

        return new SpikeReport("S4-terminal", DateTimeOffset.Now, MachineInfo.Capture(), checks.ToImmutable());
    }

    private async Task<TerminalDump?> WaitAsync(Func<TerminalDump, bool> condition, TimeSpan timeout)
    {
        var clock = Stopwatch.StartNew();
        TerminalDump? last = null;
        while (clock.Elapsed < timeout)
        {
            last = await bridge.DumpAsync();
            if (condition(last))
            {
                return last;
            }

            await Task.Delay(150);
        }

        return null;
    }

    private async Task<CheckResult> ShellEchoAsync()
    {
        bridge.Send("\"NAUTIX-\" + (6*7)\r");
        var dump = await WaitAsync(d => d.HasLine("NAUTIX-42"), TimeSpan.FromSeconds(10));
        return CheckResult.Create(
            "Interactive shell: command in, output rendered",
            dump is not null,
            "the evaluated output line 'NAUTIX-42' appears in the terminal buffer",
            dump is null ? "output line not found" : $"renderer: {bridge.Renderer}; size {dump.Columns}x{dump.Rows}");
    }

    private async Task<CheckResult> UnicodeAsync()
    {
        bridge.Send("Write-Host 'é-ñ-日本-😀' -ForegroundColor Green\r");
        var dump = await WaitAsync(d => d.HasLine("é-ñ-日本-😀"), TimeSpan.FromSeconds(10));
        return CheckResult.Create(
            "Unicode (accents, CJK, emoji) round-trips through ConPTY and xterm.js",
            dump is not null,
            "the exact string appears in the buffer (colour is confirmed in the screenshot)",
            dump is null ? "string not found" : string.Empty);
    }

    private async Task<CheckResult> ResizeAsync()
    {
        bridge.RequestResize(100, 30);
        await Task.Delay(500);
        bridge.Send("'SIZE-' + [Console]::WindowWidth + 'x' + [Console]::WindowHeight\r");
        var dump = await WaitAsync(d => d.HasLine("SIZE-100x30"), TimeSpan.FromSeconds(10));
        return CheckResult.Create(
            "Resize: xterm.js -> ConPTY -> the shell sees the new size",
            dump is not null,
            "the shell reports 100x30 after the terminal is resized to 100x30",
            dump is null ? "shell did not report the new size" : string.Empty);
    }

    private async Task<CheckResult> ThemeAsync()
    {
        setTheme(Nautix.Ui.Theming.ThemeMode.Light);
        bridge.ApplyTheme(TerminalTheme.FromTokens());
        var light = await WaitAsync(d => d.Background is not null, TimeSpan.FromSeconds(5));
        var lightBackground = light?.Background;

        setTheme(Nautix.Ui.Theming.ThemeMode.Dark);
        bridge.ApplyTheme(TerminalTheme.FromTokens());
        await Task.Delay(300);
        var dark = await bridge.DumpAsync();

        var passed = lightBackground is not null && dark.Background is not null && !string.Equals(lightBackground, dark.Background, StringComparison.OrdinalIgnoreCase);
        return CheckResult.Create(
            "Theme tokens reach the terminal at runtime (light then dark)",
            passed,
            "terminal background changes with the theme",
            $"light {lightBackground} / dark {dark.Background}");
    }

    private async Task<CheckResult> VimAsync()
    {
        bridge.Send($"wsl.exe -d {options.Distro} --exec vim.tiny -N -u NONE /tmp/s4-vim.txt\r");
        var entered = await WaitAsync(d => d.IsAlternateScreen && d.VisibleLines.Count(l => l.StartsWith('~')) >= 5, TimeSpan.FromSeconds(20));
        if (entered is null)
        {
            return CheckResult.Create("Full-screen app (vim) renders and exits cleanly", false, "alternate screen entered with '~' filler", "vim did not reach the alternate screen (is vim-tiny installed in the distro?)");
        }

        var fillers = entered.VisibleLines.Count(l => l.StartsWith('~'));
        bridge.Send("ihello-nautix");
        var typed = await WaitAsync(d => d.VisibleLines.Any(l => l.Contains("hello-nautix", StringComparison.Ordinal)) && d.VisibleLines.Any(l => l.Contains("INSERT", StringComparison.Ordinal)), TimeSpan.FromSeconds(10));
        if (options.Screenshots)
        {
            await bridge.CaptureAsync(Path.Combine(options.OutputDirectory, "vim.png"));
        }

        bridge.Send("\u001b:q!\r");
        var left = await WaitAsync(d => !d.IsAlternateScreen && d.Lines.Any(l => l.StartsWith("PS ", StringComparison.Ordinal)), TimeSpan.FromSeconds(10));

        var passed = typed is not null && left is not null;
        return CheckResult.Create(
            "Full-screen app (vim) renders and exits cleanly",
            passed,
            "alternate screen entered/left, '~' filler, insert mode text visible",
            passed ? string.Empty : $"typed text/mode visible={typed is not null}, returned to shell={left is not null}",
            ("fillerLines", fillers));
    }

    private async Task<CheckResult> FloodAsync()
    {
        var clock = Stopwatch.StartNew();
        bridge.Send($"wsl.exe -d {options.Distro} --exec seq 1 300000\r");
        var finished = await WaitAsync(d => d.HasLine("300000"), TimeSpan.FromSeconds(60));
        var seconds = clock.Elapsed.TotalSeconds;
        var responsive = Stopwatch.StartNew();
        _ = await bridge.DumpAsync();
        var responseMs = responsive.Elapsed.TotalMilliseconds;

        var passed = finished is not null && seconds <= 10 && responseMs < 1000;
        return CheckResult.Create(
            "Output flood: 300000 lines",
            passed,
            "completes in <= 10 s and the page stays responsive (< 1 s to answer afterwards)",
            finished is null ? "last line never rendered" : string.Empty,
            ("seconds", seconds),
            ("responseAfterFloodMs", responseMs));
    }

    private async Task<CheckResult> DockerExecAsync()
    {
        const string Container = "s4-box";
        var context = options.DockerContext!;
        Docker("rm", "-f", Container);
        if (Docker("run", "-d", "--name", Container, "alpine", "sleep", "600") != 0)
        {
            return CheckResult.Create("docker exec -it through the relay (shell, resize, vi)", false, "container starts through the relay", $"docker run failed on context '{context}'");
        }

        try
        {
            bridge.Send($"& '{options.DockerExe}' --context {context} exec -it {Container} sh\r");
            var shell = await WaitAsync(d => d.Lines.Any(l => l.TrimEnd().EndsWith('#') || l.Contains("/ #", StringComparison.Ordinal)), TimeSpan.FromSeconds(30));
            if (shell is null)
            {
                return CheckResult.Create("docker exec -it through the relay (shell, resize, vi)", false, "interactive shell prompt", "no shell prompt from docker exec -it");
            }

            bridge.Send("echo $((6*7))\r");
            var math = await WaitAsync(d => d.HasLine("42"), TimeSpan.FromSeconds(10));

            bridge.RequestResize(90, 28);
            await Task.Delay(800);
            bridge.Send("stty size\r");
            var resized = await WaitAsync(d => d.HasLine("28 90"), TimeSpan.FromSeconds(10));

            bridge.Send("vi /tmp/x\r");
            var vi = await WaitAsync(d => d.IsAlternateScreen && d.VisibleLines.Count(l => l.StartsWith('~')) >= 5, TimeSpan.FromSeconds(10));
            if (options.Screenshots)
            {
                await bridge.CaptureAsync(Path.Combine(options.OutputDirectory, "docker-exec-vi.png"));
            }

            bridge.Send("\u001b:q!\r");
            var backToShell = await WaitAsync(d => !d.IsAlternateScreen, TimeSpan.FromSeconds(10));
            bridge.Send("exit\r");

            var passed = math is not null && resized is not null && vi is not null && backToShell is not null;
            return CheckResult.Create(
                "docker exec -it through the relay (shell, resize, vi)",
                passed,
                "echo works, stty size follows resize (28 90), full-screen vi renders and exits",
                $"echo={math is not null} resize={resized is not null} vi={vi is not null} exit-vi={backToShell is not null}");
        }
        finally
        {
            Docker("rm", "-f", Container);
        }
    }

    private int Docker(params string[] arguments)
    {
        var start = new ProcessStartInfo(options.DockerExe) { CreateNoWindow = true, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        start.ArgumentList.Add("--context");
        start.ArgumentList.Add(options.DockerContext!);
        foreach (var argument in arguments)
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start)!;
        process.WaitForExit(TimeSpan.FromSeconds(120));
        return process.HasExited ? process.ExitCode : -1;
    }
}
