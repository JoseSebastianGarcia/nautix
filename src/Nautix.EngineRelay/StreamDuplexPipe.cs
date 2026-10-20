using System.IO.Pipelines;

namespace Nautix.EngineRelay;

/// <summary>Adapts a <see cref="Stream"/> (the client's named pipe) to <see cref="IDuplexPipe"/> with 64 KB buffers.</summary>
public sealed class StreamDuplexPipe(Stream stream) : IDuplexPipe
{
    public PipeReader Input { get; } = PipeReader.Create(stream, new StreamPipeReaderOptions(bufferSize: 65536, minimumReadSize: 16384, leaveOpen: true));

    public PipeWriter Output { get; } = PipeWriter.Create(stream, new StreamPipeWriterOptions(minimumBufferSize: 65536, leaveOpen: true));
}
