using System.Buffers;
using Shouldly;

namespace Nautix.EngineRelay.Tests;

public sealed class ArgumentsInstanceAndProcessTests
{
    [Fact]
    public void Defaults_follow_the_spec()
    {
        var options = RelayArguments.Parse([]).Value;

        options.PipeName.ShouldBe("nautix_engine");
        options.ControlPipeName.ShouldBe("nautix_relay_control");
        options.Distro.ShouldBe("nautix-engine");
        options.Transport.ShouldBe(EngineTransportKind.DialStdio);
        options.MutexName.ShouldBe(@"Local\Nautix.EngineRelay");
        options.KeepAlive.ShouldBeTrue();
    }

    [Fact]
    public void Every_option_is_parsed()
    {
        var options = RelayArguments.Parse(["--pipe", "p", "--control-pipe", "c", "--distro", "d", "--transport", "socat", "--keep-alive", "false"]).Value;

        options.PipeName.ShouldBe("p");
        options.ControlPipeName.ShouldBe("c");
        options.Distro.ShouldBe("d");
        options.Transport.ShouldBe(EngineTransportKind.Socat);
        options.KeepAlive.ShouldBeFalse();
    }

    [Theory]
    [InlineData("--pipe")]
    [InlineData("--transport", "carrier-pigeon")]
    [InlineData("--keep-alive", "maybe")]
    [InlineData("--bogus", "1")]
    public void Bad_arguments_are_a_validation_failure(params string[] args)
    {
        var result = RelayArguments.Parse(args);

        result.IsFailure.ShouldBeTrue();
        result.Error.Code.ShouldBe("relay.arguments");
    }

    [Fact]
    public void Only_one_relay_instance_can_hold_the_mutex()
    {
        var name = @"Local\Nautix.Test." + Guid.NewGuid().ToString("N");
        using var first = SingleInstance.TryAcquire(name);

        first.ShouldNotBeNull();
        SingleInstance.TryAcquire(name).ShouldBeNull();
    }

    [Fact]
    public void Transport_selection_follows_the_option()
    {
        ProcessEngineTransport.For(new RelayOptions { Transport = EngineTransportKind.DialStdio }).ShouldBeOfType<ProcessEngineTransport>();
        ProcessEngineTransport.For(new RelayOptions { Transport = EngineTransportKind.Socat }).ShouldBeOfType<ProcessEngineTransport>();
    }

    [Fact]
    public async Task A_child_process_transport_pipes_bytes_both_ways_and_is_released_on_dispose()
    {
        Assert.SkipUnless(OperatingSystem.IsLinux(), "uses 'cat' as the echo child");
        var transport = new ProcessEngineTransport("cat", []);

        var connection = await transport.OpenAsync(CancellationToken.None);
        await connection.ToEngine.WriteAsync("ping"u8.ToArray());
        var result = await connection.FromEngine.ReadAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
        System.Text.Encoding.UTF8.GetString(result.Buffer.FirstSpan).ShouldBe("ping");
        connection.FromEngine.AdvanceTo(result.Buffer.End);

        await connection.DisposeAsync().AsTask().WaitAsync(TimeSpan.FromSeconds(10));
    }
}
