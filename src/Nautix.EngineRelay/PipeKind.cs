namespace Nautix.EngineRelay;

public enum PipeKind
{
    /// <summary>Engine traffic. Message mode lets a client's zero-length write act as write-shutdown (go-winio <c>CloseWrite</c>), which <c>docker run -i</c> relies on.</summary>
    Message,

    /// <summary>Plain byte stream (control channel, tests on platforms without message mode).</summary>
    Byte,
}
