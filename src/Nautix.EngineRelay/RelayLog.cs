using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>Source-generated log messages. Never include payload bytes, only counts and lifecycle facts.</summary>
internal static partial class RelayLog
{
    [LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "Relay listening on pipe {Pipe} (transport {Transport}, distro {Distro}).")]
    public static partial void Started(ILogger logger, string pipe, EngineTransportKind transport, string distro);

    [LoggerMessage(EventId = 2, Level = LogLevel.Information, Message = "Relay stopped after {Total} connections.")]
    public static partial void Stopped(ILogger logger, long total);

    [LoggerMessage(EventId = 3, Level = LogLevel.Debug, Message = "Client connected ({Active} active).")]
    public static partial void ClientConnected(ILogger logger, int active);

    [LoggerMessage(EventId = 4, Level = LogLevel.Debug, Message = "Client finished ({Active} active).")]
    public static partial void ClientFinished(ILogger logger, int active);

    [LoggerMessage(EventId = 5, Level = LogLevel.Warning, Message = "Could not open an engine connection.")]
    public static partial void EngineUnavailable(ILogger logger, Exception exception);

    [LoggerMessage(EventId = 6, Level = LogLevel.Warning, Message = "Connection ended with an I/O error.")]
    public static partial void ConnectionFailed(ILogger logger, Exception exception);

    [LoggerMessage(EventId = 7, Level = LogLevel.Warning, Message = "Accepting a client failed; retrying.")]
    public static partial void AcceptFailed(ILogger logger, Exception exception);

    [LoggerMessage(EventId = 8, Level = LogLevel.Information, Message = "Keeping distro {Distro} alive: {Reason}.")]
    public static partial void KeepAliveStarted(ILogger logger, string distro, string reason);

    [LoggerMessage(EventId = 9, Level = LogLevel.Information, Message = "Releasing the distro keep-alive.")]
    public static partial void KeepAliveReleased(ILogger logger);

    [LoggerMessage(EventId = 10, Level = LogLevel.Warning, Message = "Could not start the distro keep-alive process.")]
    public static partial void KeepAliveFailed(ILogger logger, Exception exception);

    [LoggerMessage(EventId = 11, Level = LogLevel.Information, Message = "Control command received: {Command}.")]
    public static partial void ControlCommand(ILogger logger, string command);

    [LoggerMessage(EventId = 12, Level = LogLevel.Error, Message = "Could not listen on the engine pipe.")]
    public static partial void ListenFailed(ILogger logger, Exception exception);
}
