namespace Nautix.SharedKernel;

public enum ConfirmationLevel
{
    /// <summary>One explicit confirmation listing the affected objects.</summary>
    Standard,

    /// <summary>Two-step confirmation for irreversible, wide-impact operations (for example engine reset).</summary>
    TwoStep,
}
