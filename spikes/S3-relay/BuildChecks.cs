using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>docker build / buildx build through the relay: BuildKit sessions are gRPC over a hijacked connection, the case the relay design must not break.</summary>
internal static class BuildChecks
{
    private static readonly TimeSpan _buildTimeout = TimeSpan.FromMinutes(10);

    public static async Task<CheckResult> BuildAsync(S3Context ctx)
    {
        var directory = Directory.CreateTempSubdirectory("nautix-s3-build-").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(directory, "hello.txt"), "hello-from-context\n");
            await File.WriteAllTextAsync(
                Path.Combine(directory, "Dockerfile"),
                "FROM alpine:3.20 AS base\nRUN echo layer-one > /a\nFROM alpine:3.20\nCOPY --from=base /a /a\nCOPY hello.txt /hello.txt\nCMD [\"sh\", \"-c\", \"cat /a /hello.txt\"]\n");

            var build = await ctx.Cli.DockerAsync(_buildTimeout, "build", "--progress=plain", "-t", "s3-build", directory);
            var run = build.Succeeded ? await ctx.Cli.DockerAsync(TimeSpan.FromMinutes(1), "run", "--rm", "s3-build") : null;
            var buildKit = build.StandardError.Contains("[internal] load build definition", StringComparison.Ordinal);

            var buildx = await ctx.Cli.DockerAsync(_buildTimeout, "buildx", "build", "--progress=plain", "--load", "-t", "s3-buildx", directory);
            var buildxRun = buildx.Succeeded ? await ctx.Cli.DockerAsync(TimeSpan.FromMinutes(1), "run", "--rm", "s3-buildx") : null;

            var passed = build.Succeeded && run is { Succeeded: true } && run.StandardOutput.Contains("layer-one", StringComparison.Ordinal) && run.StandardOutput.Contains("hello-from-context", StringComparison.Ordinal);
            var notes = $"docker build used {(buildKit ? "BuildKit" : "the legacy builder")}; buildx build: {(buildx.Succeeded && buildxRun is { Succeeded: true } ? "ok" : "failed or buildx plugin missing — " + buildx.StandardError.Trim().Split('\n').LastOrDefault())}";
            return CheckResult.Create(
                "multi-stage docker build (and buildx build) through the relay",
                passed,
                "image builds, runs, and contains both stages' files",
                passed ? notes : notes + " | " + build.StandardError.Trim().Split('\n').LastOrDefault(),
                ("buildSeconds", build.Elapsed.TotalSeconds),
                ("buildxSeconds", buildx.Elapsed.TotalSeconds),
                ("buildKit", buildKit ? 1 : 0),
                ("buildxWorks", buildx.Succeeded && buildxRun is { Succeeded: true } ? 1 : 0));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
