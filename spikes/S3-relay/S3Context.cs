using Docker.DotNet;

namespace Nautix.Spikes.S3;

/// <summary>Everything a check needs: options, CLI runner, the relay under test and a Docker.DotNet client factory.</summary>
internal sealed class S3Context(S3Options options, CliRunner cli, RelayProcess relay)
{
    public S3Options Options { get; } = options;

    public CliRunner Cli { get; } = cli;

    public RelayProcess Relay { get; } = relay;

    public IDockerClient NewClient(string? pipeName = null) =>
        new DockerClientBuilder()
            .WithEndpoint(new Uri(pipeName is null ? Options.NpipeUri : $"npipe://./pipe/{pipeName}"))
            .WithTimeout(TimeSpan.FromSeconds(60))
            .Build();

    public async Task CleanupAsync()
    {
        _ = await Cli.DockerAsync(TimeSpan.FromSeconds(60), "rm", "-f", "s3-ticker", "s3-sh", "s3-api", "s3-half");
        _ = await Cli.DockerAsync(TimeSpan.FromSeconds(120), "rmi", "-f", "s3-build", "s3-buildx", "s3-big");
    }
}
