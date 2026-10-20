using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Microsoft.Win32;

namespace Nautix.Spikes.Common;

/// <summary>Hardware/OS facts that make a performance number reproducible (docs/spec/07: record the reference laptop).</summary>
public sealed record MachineInfo(
    string Os,
    string Cpu,
    int LogicalCores,
    double RamGiB,
    string Gpus,
    string Display,
    bool OnAcPower,
    string Runtime)
{
    public string Summary => $"{Cpu} / {LogicalCores} threads / {RamGiB:0.#} GiB / {Gpus} / {Display} / AC={OnAcPower}";

    public static MachineInfo Capture()
    {
        if (!OperatingSystem.IsWindows())
        {
            return new MachineInfo(RuntimeInformation.OSDescription, "n/a", Environment.ProcessorCount, 0, "n/a", "n/a", true, RuntimeInformation.FrameworkDescription);
        }

        return new MachineInfo(
            $"{RuntimeInformation.OSDescription} (build {WindowsBuild()})",
            ReadCpu(),
            Environment.ProcessorCount,
            Math.Round(GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / 1024.0 / 1024 / 1024, 1),
            ReadGpus(),
            ReadDisplay(),
            ReadAcPower(),
            RuntimeInformation.FrameworkDescription);
    }

    [SupportedOSPlatform("windows")]
    private static string WindowsBuild()
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
        return $"{key?.GetValue("CurrentBuild")}.{key?.GetValue("UBR")}";
    }

    [SupportedOSPlatform("windows")]
    private static string ReadCpu()
    {
        using var key = Registry.LocalMachine.OpenSubKey(@"HARDWARE\DESCRIPTION\System\CentralProcessor\0");
        return (key?.GetValue("ProcessorNameString") as string)?.Trim() ?? "unknown CPU";
    }

    [SupportedOSPlatform("windows")]
    private static string ReadGpus()
    {
        const string DisplayClass = @"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        using var root = Registry.LocalMachine.OpenSubKey(DisplayClass);
        if (root is null)
        {
            return "unknown GPU";
        }

        var names = root.GetSubKeyNames()
            .Where(n => n.Length == 4 && n.All(char.IsAsciiDigit))
            .Select(n =>
            {
                using var sub = root.OpenSubKey(n);
                return sub?.GetValue("DriverDesc") as string;
            })
            .OfType<string>()
            .Distinct(StringComparer.Ordinal);
        return string.Join(" + ", names);
    }

    [SupportedOSPlatform("windows")]
    private static string ReadDisplay()
    {
        var mode = new NativeMethods.DevMode { Size = (ushort)Marshal.SizeOf<NativeMethods.DevMode>() };
        return NativeMethods.EnumDisplaySettingsW(null, NativeMethods.CurrentSettings, ref mode)
            ? $"{mode.PelsWidth}x{mode.PelsHeight}@{mode.DisplayFrequency}Hz"
            : "unknown display";
    }

    [SupportedOSPlatform("windows")]
    private static bool ReadAcPower() =>
        !NativeMethods.GetSystemPowerStatus(out var status) || status.AcLineStatus != 0;
}
