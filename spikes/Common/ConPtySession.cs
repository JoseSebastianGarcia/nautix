using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Nautix.Spikes.Common;

/// <summary>
/// A child process attached to a Windows pseudo console (ConPTY). Output carries VT sequences as UTF-8 bytes;
/// input accepts keystrokes as UTF-8. This is the prototype of <c>ConPtyTerminalAdapter</c> (ITerminalHost).
/// </summary>
[SupportedOSPlatform("windows10.0.17763")]
public sealed class ConPtySession : IDisposable
{
    private readonly nint _console;
    private readonly nint _process;
    private readonly nint _attributeList;
    private readonly FileStream _input;
    private readonly FileStream _output;
    private int _disposed;

    private ConPtySession(nint console, nint process, nint attributeList, int processId, FileStream input, FileStream output)
    {
        _console = console;
        _process = process;
        _attributeList = attributeList;
        ProcessId = processId;
        _input = input;
        _output = output;
    }

    public int ProcessId { get; }

    /// <summary>Bytes the child writes to its console (VT output). Reading ends after the console is closed.</summary>
    public Stream Output => _output;

    /// <summary>Keystrokes sent to the child.</summary>
    public Stream Input => _input;

#pragma warning disable CA2000 // inputWrite/outputRead are handed to the FileStreams on success; the spike does not clean up on a failed start.
    public static ConPtySession Start(string commandLine, short columns, short rows, string? workingDirectory = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(commandLine);

        // Two pipes: we write to inputWrite -> the console reads inputRead; the console writes outputWrite -> we read outputRead.
        Check(ConPtyNative.CreatePipe(out var inputRead, out var inputWrite, 0, 0), "CreatePipe(input)");
        Check(ConPtyNative.CreatePipe(out var outputRead, out var outputWrite, 0, 0), "CreatePipe(output)");

        var hr = ConPtyNative.CreatePseudoConsole(new ConPtyNative.Coord { X = columns, Y = rows }, inputRead, outputWrite, 0, out var console);
        if (hr != 0)
        {
            throw new InvalidOperationException($"CreatePseudoConsole failed: 0x{hr:X8}");
        }

        // The pseudo console owns duplicates of its ends; ours must be closed or EOF never arrives.
        inputRead.Dispose();
        outputWrite.Dispose();

        nuint size = 0;
        _ = ConPtyNative.InitializeProcThreadAttributeList(0, 1, 0, ref size);
        var attributeList = Marshal.AllocHGlobal((nint)size);
        Check(ConPtyNative.InitializeProcThreadAttributeList(attributeList, 1, 0, ref size), "InitializeProcThreadAttributeList");
        Check(
            ConPtyNative.UpdateProcThreadAttribute(attributeList, 0, ConPtyNative.ProcThreadAttributePseudoConsole, console, (nuint)nint.Size, 0, 0),
            "UpdateProcThreadAttribute");

        var startup = new ConPtyNative.StartupInfoEx { AttributeList = attributeList };
        startup.StartupInfo.Cb = (uint)Marshal.SizeOf<ConPtyNative.StartupInfoEx>();

        // CreateProcessW may modify the command line buffer, so it must be writable unmanaged memory.
        var commandBuffer = Marshal.StringToHGlobalUni(commandLine);
        var directoryBuffer = workingDirectory is null ? 0 : Marshal.StringToHGlobalUni(workingDirectory);
        try
        {
            Check(
                ConPtyNative.CreateProcessW(0, commandBuffer, 0, 0, false, ConPtyNative.ExtendedStartupInfoPresent, 0, directoryBuffer, ref startup, out var info),
                $"CreateProcess({commandLine})");
            _ = ConPtyNative.CloseHandle(info.Thread);

            return new ConPtySession(
                console,
                info.Process,
                attributeList,
                (int)info.ProcessId,
                new FileStream(inputWrite, FileAccess.Write, 1, isAsync: false),
                new FileStream(outputRead, FileAccess.Read, 1, isAsync: false));
        }
        finally
        {
            Marshal.FreeHGlobal(commandBuffer);
            if (directoryBuffer != 0)
            {
                Marshal.FreeHGlobal(directoryBuffer);
            }
        }
    }

#pragma warning restore CA2000

    public void Write(string text)
    {
        var bytes = Encoding.UTF8.GetBytes(text);
        _input.Write(bytes);
        _input.Flush();
    }

    public void Resize(short columns, short rows)
    {
        var hr = ConPtyNative.ResizePseudoConsole(_console, new ConPtyNative.Coord { X = columns, Y = rows });
        if (hr != 0)
        {
            throw new InvalidOperationException($"ResizePseudoConsole failed: 0x{hr:X8}");
        }
    }

    public bool HasExited => ConPtyNative.WaitForSingleObject(_process, 0) == ConPtyNative.WaitObject0;

    public int? ExitCode => HasExited && ConPtyNative.GetExitCodeProcess(_process, out var code) ? (int)code : null;

    public Task<int> WaitForExitAsync(CancellationToken ct) =>
        Task.Run(
            () =>
            {
                while (!HasExited)
                {
                    ct.ThrowIfCancellationRequested();
                    Thread.Sleep(25);
                }

                return ExitCode ?? -1;
            },
            ct);

    public void Kill()
    {
        if (!HasExited)
        {
            _ = ConPtyNative.TerminateProcess(_process, 1);
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1)
        {
            return;
        }

        Kill();
        _input.Dispose();

        // ClosePseudoConsole can wait for the output pipe to drain, so run it while draining.
        var closing = Task.Run(() => ConPtyNative.ClosePseudoConsole(_console));
        var drain = new byte[4096];
        while (!closing.IsCompleted)
        {
            try
            {
                if (_output.Read(drain) == 0)
                {
                    break;
                }
            }
            catch (IOException)
            {
                break;
            }
        }

        _ = closing.Wait(TimeSpan.FromSeconds(2));
        _output.Dispose();
        ConPtyNative.DeleteProcThreadAttributeList(_attributeList);
        Marshal.FreeHGlobal(_attributeList);

        _ = ConPtyNative.CloseHandle(_process);
    }

    private static void Check(bool ok, string what)
    {
        if (!ok)
        {
            throw new InvalidOperationException($"{what} failed (Win32 error {Marshal.GetLastWin32Error()}).");
        }
    }
}
