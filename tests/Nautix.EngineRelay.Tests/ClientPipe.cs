using System.IO.Pipelines;

namespace Nautix.EngineRelay.Tests;

/// <summary>The test's end of an in-memory client connection: write into <see cref="ToRelay"/>, read from <see cref="FromRelay"/>.</summary>
internal sealed class ClientPipe
{
    private readonly Pipe _toRelay = new();
    private readonly Pipe _fromRelay = new();

    public ClientPipe() => Relay = new Duplex(_toRelay.Reader, _fromRelay.Writer);

    /// <summary>The relay's view.</summary>
    public IDuplexPipe Relay { get; }

    public PipeWriter ToRelay => _toRelay.Writer;

    public PipeReader FromRelay => _fromRelay.Reader;

    private sealed class Duplex(PipeReader input, PipeWriter output) : IDuplexPipe
    {
        public PipeReader Input { get; } = input;

        public PipeWriter Output { get; } = output;
    }
}
