using System.Globalization;
using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>Daily-rolling text log (<c>relay-yyyyMMdd.log</c>), seven days kept. Receives lifecycle events only, never payloads.</summary>
public sealed class RollingFileLogger : ILogger, IDisposable
{
    private const int RetainedDays = 7;

    private readonly string _directory;
    private readonly LogLevel _minimum;
    private readonly Lock _gate = new();

    public RollingFileLogger(string directory, LogLevel minimum = LogLevel.Information)
    {
        _directory = directory;
        _minimum = minimum;
        Directory.CreateDirectory(directory);
        Prune();
    }

    public IDisposable? BeginScope<TState>(TState state)
        where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => logLevel >= _minimum;

    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
    {
        ArgumentNullException.ThrowIfNull(formatter);
        if (!IsEnabled(logLevel))
        {
            return;
        }

        var now = DateTimeOffset.Now;
        var line = string.Create(
            CultureInfo.InvariantCulture,
            $"{now:yyyy-MM-dd HH:mm:ss.fff} {logLevel,-11} {formatter(state, exception)}{(exception is null ? string.Empty : " | " + exception.GetType().Name + ": " + exception.Message)}{Environment.NewLine}");
        var path = Path.Combine(_directory, string.Create(CultureInfo.InvariantCulture, $"relay-{now:yyyyMMdd}.log"));

        lock (_gate)
        {
            File.AppendAllText(path, line);
        }
    }

    public void Dispose()
    {
        // Nothing buffered: every line is appended immediately.
    }

    private void Prune()
    {
        foreach (var file in Directory.EnumerateFiles(_directory, "relay-*.log"))
        {
            if (File.GetLastWriteTimeUtc(file) < DateTime.UtcNow.AddDays(-RetainedDays))
            {
                File.Delete(file);
            }
        }
    }
}
