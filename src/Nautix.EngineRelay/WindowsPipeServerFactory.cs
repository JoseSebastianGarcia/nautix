using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;

namespace Nautix.EngineRelay;

/// <summary>Creates pipes whose only ACE grants FullControl to the current user's SID (docs/spec/06 security requirement 2).</summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsPipeServerFactory : IPipeServerFactory
{
    private const int BufferSize = 65536;

    public NamedPipeServerStream Create(string name, PipeKind kind, bool firstInstance)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var user = identity.User ?? throw new InvalidOperationException("The current user has no SID.");

        var security = new PipeSecurity();
        security.AddAccessRule(new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));

        var options = PipeOptions.Asynchronous | (firstInstance ? PipeOptions.FirstPipeInstance : PipeOptions.None);
        return NamedPipeServerStreamAcl.Create(
            name,
            PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances,
            kind == PipeKind.Message ? PipeTransmissionMode.Message : PipeTransmissionMode.Byte,
            options,
            BufferSize,
            BufferSize,
            security);
    }
}
