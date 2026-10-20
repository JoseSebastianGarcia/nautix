using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S4;

/// <summary>
/// Joins an xterm.js terminal (in WebView2) to a ConPTY session: shell output goes to the page, keystrokes and
/// resizes come back. Prototype of the ConPtyTerminalAdapter + terminal control pair.
/// </summary>
internal sealed class TerminalBridge : IDisposable
{
    private readonly WebView2 _web;
    private readonly Dispatcher _dispatcher;
    private readonly TaskCompletionSource _ready = new();
    private readonly Dictionary<int, TaskCompletionSource<TerminalDump>> _dumps = [];
    private readonly CancellationTokenSource _lifetime = new();
    private ConPtySession? _session;
    private int _nextDump;
    private short _columns = 80;
    private short _rows = 24;

    public TerminalBridge(WebView2 web)
    {
        _web = web;
        _dispatcher = web.Dispatcher;
    }

    public string Renderer { get; private set; } = "unknown";

    public ConPtySession? Session => _session;

    public async Task InitializeAsync(string assetsDirectory)
    {
        if (CoreWebView2Environment.GetAvailableBrowserVersionString() is null)
        {
            throw new InvalidOperationException("WebView2 runtime is not installed (it ships with Windows 11; install the Evergreen runtime).");
        }

        var userData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Nautix", "spikes", "webview2");
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userData);
        await _web.EnsureCoreWebView2Async(environment);
        _web.CoreWebView2.SetVirtualHostNameToFolderMapping("nautix.terminal", assetsDirectory, CoreWebView2HostResourceAccessKind.Allow);
        _web.CoreWebView2.WebMessageReceived += OnMessage;
        _web.CoreWebView2.Navigate("https://nautix.terminal/terminal.html");
        await _ready.Task.WaitAsync(TimeSpan.FromSeconds(15));
    }

    public void ApplyTheme(IReadOnlyDictionary<string, string> theme) => Post(new { t = "theme", theme });

    /// <summary>Starts a program in a new pseudo console sized to the current terminal.</summary>
    public void Start(string commandLine)
    {
        _session?.Dispose();
        _session = ConPtySession.Start(commandLine, _columns, _rows);
        var session = _session;
        _ = Task.Run(() => PumpOutput(session, _lifetime.Token));
    }

    public void Send(string keystrokes) => _session?.Write(keystrokes);

    /// <summary>Asks xterm.js to resize; the page then reports the new size, which resizes the pseudo console (the production path).</summary>
    public void RequestResize(int columns, int rows) => Post(new { t = "resize", cols = columns, rows });

    public Task<TerminalDump> DumpAsync()
    {
        var id = Interlocked.Increment(ref _nextDump);
        var source = new TaskCompletionSource<TerminalDump>(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_dumps)
        {
            _dumps[id] = source;
        }

        Post(new { t = "dump", id });
        return source.Task.WaitAsync(TimeSpan.FromSeconds(10));
    }

    public async Task CaptureAsync(string path)
    {
        await using var stream = File.Create(path);
        await _web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
    }

    public void Dispose()
    {
        _lifetime.Cancel();
        _session?.Dispose();
        _lifetime.Dispose();
    }

    private void Post(object message)
    {
        var json = JsonSerializer.Serialize(message);
        _dispatcher.InvokeAsync(() => _web.CoreWebView2.PostWebMessageAsJson(json));
    }

    private async Task PumpOutput(ConPtySession session, CancellationToken ct)
    {
        var buffer = new byte[32 * 1024];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                var read = await session.Output.ReadAsync(buffer, ct);
                if (read == 0)
                {
                    break;
                }

                Post(new { t = "out", d = Convert.ToBase64String(buffer, 0, read) });
            }
        }
        catch (Exception ex) when (ex is IOException or OperationCanceledException or ObjectDisposedException)
        {
            // Session closed: nothing more to render.
        }
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        using var document = JsonDocument.Parse(e.WebMessageAsJson);
        var root = document.RootElement;
        switch (root.GetProperty("t").GetString())
        {
            case "ready":
                _columns = (short)root.GetProperty("cols").GetInt32();
                _rows = (short)root.GetProperty("rows").GetInt32();
                Renderer = root.GetProperty("renderer").GetString() ?? "unknown";
                _ready.TrySetResult();
                break;
            case "in":
                _session?.Write(root.GetProperty("d").GetString() ?? string.Empty);
                break;
            case "bin":
                // onBinary delivers raw bytes as a "binary string" (one char per byte), used for legacy mouse reports.
                _session?.Input.Write(Encoding.Latin1.GetBytes(root.GetProperty("d").GetString() ?? string.Empty));
                _session?.Input.Flush();
                break;
            case "resize":
                _columns = (short)root.GetProperty("cols").GetInt32();
                _rows = (short)root.GetProperty("rows").GetInt32();
                _session?.Resize(_columns, _rows);
                break;
            case "dump":
                Complete(root);
                break;
            default:
                break;
        }
    }

    private void Complete(JsonElement root)
    {
        var id = root.GetProperty("id").GetInt32();
        var dump = new TerminalDump(
            [.. root.GetProperty("lines").EnumerateArray().Select(l => l.GetString() ?? string.Empty)],
            root.GetProperty("bufferType").GetString() ?? "normal",
            root.GetProperty("cols").GetInt32(),
            root.GetProperty("rows").GetInt32(),
            root.GetProperty("viewportY").GetInt32(),
            root.TryGetProperty("background", out var bg) && bg.ValueKind == JsonValueKind.String ? bg.GetString() : null,
            root.GetProperty("renderer").GetString() ?? "unknown");

        TaskCompletionSource<TerminalDump>? source;
        lock (_dumps)
        {
            _ = _dumps.Remove(id, out source);
        }

        source?.TrySetResult(dump);
    }
}
