using System.IO.Pipes;

namespace Nautix.EngineRelay;

/// <summary>Byte-mode pipes without ACLs, for platforms where message mode and ACLs do not exist (Linux test runs).</summary>
public sealed class PortablePipeServerFactory : IPipeServerFactory
{
    public NamedPipeServerStream Create(string name, PipeKind kind, bool firstInstance) =>
        new(
            name,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte,
            PipeOptions.Asynchronous | (firstInstance ? PipeOptions.FirstPipeInstance : PipeOptions.None));
}
