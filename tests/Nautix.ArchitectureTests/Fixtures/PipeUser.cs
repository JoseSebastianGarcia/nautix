using System.IO.Pipes;

namespace Nautix.ArchitectureTests.Fixtures;

/// <summary>Deliberate violation used as a negative control: the rules must flag this type.</summary>
public sealed class PipeUser
{
    public NamedPipeServerStream? Pipe { get; set; }
}
