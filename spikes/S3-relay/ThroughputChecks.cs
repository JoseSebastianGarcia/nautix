using System.Diagnostics;
using Nautix.Spikes.Common;

namespace Nautix.Spikes.S3;

/// <summary>docker save of a ~1 GiB incompressible image, by CLI, by API, and piped into docker load.</summary>
internal static class ThroughputChecks
{
    private const double GateMegabytesPerSecond = 100;
    private const double RelayTargetMegabytesPerSecond = 200;

    public static async Task<CheckResult> SaveLoadAsync(S3Context ctx)
    {
        const string Name = "docker save of a ~1 GiB image, and save | load";
        var gate = $"docker save >= {GateMegabytesPerSecond} MB/s (roadmap); 02-engine.md aims for {RelayTargetMegabytesPerSecond} MB/s";
        var mib = ctx.Options.BigImageMiB;
        var directory = Directory.CreateTempSubdirectory("nautix-s3-big-").FullName;
        try
        {
            await File.WriteAllTextAsync(Path.Combine(directory, "Dockerfile"), $"FROM alpine:3.20\nRUN dd if=/dev/urandom of=/blob bs=1M count={mib}\n");
            var build = await ctx.Cli.DockerAsync(TimeSpan.FromMinutes(20), "build", "-q", "-t", "s3-big", directory);
            if (!build.Succeeded)
            {
                return CheckResult.Create(Name, false, gate, "could not build the large image: " + build.StandardError.Trim());
            }

            var cli = await MeasureCliSaveAsync(ctx);
            var api = await MeasureApiSaveAsync(ctx);
            var pipeline = await MeasureSaveLoadPipelineAsync(ctx);

            var passed = cli.MegabytesPerSecond >= GateMegabytesPerSecond && cli.Bytes >= (long)mib * 1024 * 1024;
            return CheckResult.Create(
                Name,
                passed,
                gate,
                $"image tar {cli.Bytes / 1024.0 / 1024:0} MiB; save|load reload ok={pipeline.Ok}",
                ("cliSaveMBps", cli.MegabytesPerSecond),
                ("cliSaveSeconds", cli.Seconds),
                ("apiSaveMBps", api.MegabytesPerSecond),
                ("saveLoadPipelineMBps", pipeline.MegabytesPerSecond),
                ("meets200MBpsTarget", cli.MegabytesPerSecond >= RelayTargetMegabytesPerSecond ? 1 : 0));
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private static async Task<Transfer> MeasureCliSaveAsync(S3Context ctx)
    {
        using var process = Process.Start(ctx.Cli.DockerStart("save", "s3-big"))!;
        process.StandardInput.Close();
        var clock = Stopwatch.StartNew();
        var bytes = await Count(process.StandardOutput.BaseStream);
        await process.WaitForExitAsync();
        return new Transfer(bytes, clock.Elapsed.TotalSeconds, process.ExitCode == 0);
    }

    private static async Task<Transfer> MeasureApiSaveAsync(S3Context ctx)
    {
        using var client = ctx.NewClient();
        var clock = Stopwatch.StartNew();
        await using var stream = await client.Images.SaveImageAsync("s3-big", CancellationToken.None);
        var bytes = await Count(stream);
        return new Transfer(bytes, clock.Elapsed.TotalSeconds, true);
    }

    /// <summary>
    /// docker save | docker load. The image still exists, so this measures the full path in both directions
    /// (download then upload through the relay) rather than proving a from-scratch restore.
    /// </summary>
    private static async Task<Transfer> MeasureSaveLoadPipelineAsync(S3Context ctx)
    {
        using var save = Process.Start(ctx.Cli.DockerStart("save", "s3-big"))!;
        using var load = Process.Start(ctx.Cli.DockerStart("load"))!;
        save.StandardInput.Close();
        var loadOutput = load.StandardOutput.ReadToEndAsync();
        _ = load.StandardError.ReadToEndAsync();

        var clock = Stopwatch.StartNew();
        long bytes = 0;
        var buffer = new byte[1 << 20];
        int read;
        while ((read = await save.StandardOutput.BaseStream.ReadAsync(buffer)) > 0)
        {
            await load.StandardInput.BaseStream.WriteAsync(buffer.AsMemory(0, read));
            bytes += read;
        }

        load.StandardInput.Close();
        await Task.WhenAll(save.WaitForExitAsync(), load.WaitForExitAsync());
        var loaded = (await loadOutput).Contains("Loaded image", StringComparison.Ordinal);
        return new Transfer(bytes, clock.Elapsed.TotalSeconds, save.ExitCode == 0 && load.ExitCode == 0 && loaded);
    }

    private static async Task<long> Count(Stream stream)
    {
        var buffer = new byte[1 << 20];
        long total = 0;
        int read;
        while ((read = await stream.ReadAsync(buffer)) > 0)
        {
            total += read;
        }

        return total;
    }

    private sealed record Transfer(long Bytes, double Seconds, bool Ok)
    {
        public double MegabytesPerSecond => Bytes / 1_000_000.0 / Math.Max(Seconds, 0.001);
    }
}
