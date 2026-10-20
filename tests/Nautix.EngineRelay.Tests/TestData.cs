using System.IO.Pipelines;
using System.Security.Cryptography;

namespace Nautix.EngineRelay.Tests;

internal static class TestData
{
    public static byte[] Random(int length, int seed)
    {
        var data = new byte[length];
        new Random(seed).NextBytes(data);
        return data;
    }

    public static async Task<byte[]> ReadAllAsync(PipeReader reader)
    {
        using var buffer = new MemoryStream();
        while (true)
        {
            var result = await reader.ReadAsync();
            foreach (var segment in result.Buffer)
            {
                buffer.Write(segment.Span);
            }

            reader.AdvanceTo(result.Buffer.End);
            if (result.IsCompleted)
            {
                return buffer.ToArray();
            }
        }
    }

    public static string Hash(ReadOnlySpan<byte> data) => Convert.ToHexString(SHA256.HashData(data));

    public static string UniquePipeName() => "nautix-test-" + Guid.NewGuid().ToString("N");
}
