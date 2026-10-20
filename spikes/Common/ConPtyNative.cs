using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace Nautix.Spikes.Common;

/// <summary>Win32 surface for pseudo consoles (ConPTY). Layouts follow wincon.h / processthreadsapi.h.</summary>
internal static partial class ConPtyNative
{
    public const uint ExtendedStartupInfoPresent = 0x00080000;
    public const uint CreateUnicodeEnvironment = 0x00000400;
    public const nuint ProcThreadAttributePseudoConsole = 0x00020016;
    public const uint WaitObject0 = 0;
    public const uint Infinite = 0xFFFFFFFF;

    [StructLayout(LayoutKind.Sequential)]
    public struct Coord
    {
        public short X;
        public short Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct StartupInfo
    {
        public uint Cb;
        public nint Reserved;
        public nint Desktop;
        public nint Title;
        public uint X;
        public uint Y;
        public uint XSize;
        public uint YSize;
        public uint XCountChars;
        public uint YCountChars;
        public uint FillAttribute;
        public uint Flags;
        public ushort ShowWindow;
        public ushort Reserved2;
        public nint Reserved2Ptr;
        public nint StdInput;
        public nint StdOutput;
        public nint StdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct StartupInfoEx
    {
        public StartupInfo StartupInfo;
        public nint AttributeList;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ProcessInformation
    {
        public nint Process;
        public nint Thread;
        public uint ProcessId;
        public uint ThreadId;
    }

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CreatePipe(out SafeFileHandle readPipe, out SafeFileHandle writePipe, nint attributes, uint size);

    [LibraryImport("kernel32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    public static partial int CreatePseudoConsole(Coord size, SafeFileHandle input, SafeFileHandle output, uint flags, out nint console);

    [LibraryImport("kernel32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    public static partial int ResizePseudoConsole(nint console, Coord size);

    [LibraryImport("kernel32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    public static partial void ClosePseudoConsole(nint console);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool InitializeProcThreadAttributeList(nint attributeList, int attributeCount, int flags, ref nuint size);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool UpdateProcThreadAttribute(nint attributeList, uint flags, nuint attribute, nint value, nuint size, nint previousValue, nint returnSize);

    [LibraryImport("kernel32.dll")]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    public static partial void DeleteProcThreadAttributeList(nint attributeList);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CreateProcessW(
        nint applicationName,
        nint commandLine,
        nint processAttributes,
        nint threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
        uint creationFlags,
        nint environment,
        nint currentDirectory,
        ref StartupInfoEx startupInfo,
        out ProcessInformation processInformation);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool GetExitCodeProcess(nint process, out uint exitCode);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool TerminateProcess(nint process, uint exitCode);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static partial bool CloseHandle(nint handle);

    [LibraryImport("kernel32.dll", SetLastError = true)]
    [DefaultDllImportSearchPaths(DllImportSearchPath.System32)]
    public static partial uint WaitForSingleObject(nint handle, uint milliseconds);
}
