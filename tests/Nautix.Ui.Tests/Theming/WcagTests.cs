using Nautix.Ui.Theming;
using Shouldly;

namespace Nautix.Ui.Tests.Theming;

public sealed class WcagTests
{
    [Fact]
    public void Black_on_white_is_21_to_1()
    {
        Wcag.ContrastRatio("#000000", "#FFFFFF").ShouldBe(21.0, 0.001);
    }

    [Fact]
    public void Ratio_is_symmetric_and_identity_is_1()
    {
        Wcag.ContrastRatio("#336699", "#F0F0F0").ShouldBe(Wcag.ContrastRatio("#F0F0F0", "#336699"), 1e-9);
        Wcag.ContrastRatio("#336699", "#336699").ShouldBe(1.0, 1e-9);
    }

    [Fact]
    public void Known_reference_value_matches_published_calculators()
    {
        // #777777 on white is the classic 4.48:1 (just under AA).
        Wcag.ContrastRatio("#777777", "#FFFFFF").ShouldBe(4.48, 0.01);
    }

    [Theory]
    [InlineData("fff")]
    [InlineData("#12345")]
    public void Rejects_non_rrggbb_input(string hex)
    {
        Should.Throw<FormatException>(() => Wcag.RelativeLuminance(hex));
    }
}
