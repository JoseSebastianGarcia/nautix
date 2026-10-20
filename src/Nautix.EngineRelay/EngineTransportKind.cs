namespace Nautix.EngineRelay;

public enum EngineTransportKind
{
    /// <summary><c>wsl.exe -d &lt;distro&gt; --exec docker system dial-stdio</c> (default; same mechanism as ssh:// contexts).</summary>
    DialStdio,

    /// <summary>Fallback when dial-stdio is unavailable: <c>socat - UNIX-CONNECT:/var/run/docker.sock</c> inside the distro.</summary>
    Socat,
}
