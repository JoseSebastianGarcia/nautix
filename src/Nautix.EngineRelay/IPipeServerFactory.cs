using System.IO.Pipes;

namespace Nautix.EngineRelay;

public interface IPipeServerFactory
{
    /// <param name="name">Pipe name without the <c>\\.\pipe\</c> prefix.</param>
    /// <param name="kind">Transmission mode.</param>
    /// <param name="firstInstance">Fail if the name is already taken (prevents another process from squatting the pipe).</param>
    NamedPipeServerStream Create(string name, PipeKind kind, bool firstInstance);
}
