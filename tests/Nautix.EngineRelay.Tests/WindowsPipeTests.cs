using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
using Shouldly;

namespace Nautix.EngineRelay.Tests;

/// <summary>Verified only on Windows (ACLs and message-mode pipes do not exist elsewhere); skipped on Linux.</summary>
[SupportedOSPlatform("windows")]
public sealed partial class WindowsPipeTests
{
    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static partial bool WriteFile(SafePipeHandle handle, nint buffer, uint bytesToWrite, out uint written, nint overlapped);

    [Fact]
    public void The_engine_pipe_grants_full_control_to_the_current_user_only()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows named-pipe ACLs");
        using var server = new WindowsPipeServerFactory().Create(TestData.UniquePipeName(), PipeKind.Message, firstInstance: true);

        var rules = server.GetAccessControl().GetAccessRules(true, false, typeof(SecurityIdentifier)).Cast<PipeAccessRule>().ToList();

        using var identity = WindowsIdentity.GetCurrent();
        rules.Count.ShouldBe(1);
        rules[0].AccessControlType.ShouldBe(AccessControlType.Allow);
        rules[0].IdentityReference.ShouldBe(identity.User);
        rules[0].PipeAccessRights.HasFlag(PipeAccessRights.ReadWrite).ShouldBeTrue();
    }

    [Fact]
    public void A_second_first_instance_with_the_same_name_is_refused()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows named pipes");
        var factory = new WindowsPipeServerFactory();
        var name = TestData.UniquePipeName();
        using var first = factory.Create(name, PipeKind.Message, firstInstance: true);

        Should.Throw<Exception>(() => factory.Create(name, PipeKind.Message, firstInstance: true).Dispose());
    }

    [Fact]
    public async Task A_zero_length_client_write_is_seen_as_end_of_input_while_the_connection_stays_open()
    {
        // This is what go-winio's CloseWrite sends, and what 'docker run -i' relies on to signal end of stdin.
        Assert.SkipUnless(OperatingSystem.IsWindows(), "Windows message-mode pipes");
        var name = TestData.UniquePipeName();
        await using var server = new WindowsPipeServerFactory().Create(name, PipeKind.Message, firstInstance: true);
        await using var client = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        var accepted = server.WaitForConnectionAsync();
        await client.ConnectAsync(10_000);
        await accepted;

        await client.WriteAsync("abc"u8.ToArray());
        WriteFile(client.SafePipeHandle, 0, 0, out _, 0).ShouldBeTrue("zero-length WriteFile");

        var buffer = new byte[16];
        (await server.ReadAsync(buffer).AsTask().WaitAsync(TimeSpan.FromSeconds(10))).ShouldBe(3);
        (await server.ReadAsync(buffer).AsTask().WaitAsync(TimeSpan.FromSeconds(10))).ShouldBe(0, "zero-length message = write shutdown");
        server.IsConnected.ShouldBeTrue("the connection must stay open so the response can still be delivered");

        await server.WriteAsync("reply"u8.ToArray());
        (await client.ReadAsync(buffer).AsTask().WaitAsync(TimeSpan.FromSeconds(10))).ShouldBe(5);
    }
}
