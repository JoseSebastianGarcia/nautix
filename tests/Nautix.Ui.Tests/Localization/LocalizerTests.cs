using System.Globalization;
using Nautix.Ui.Localization;
using Shouldly;

namespace Nautix.Ui.Tests.Localization;

public sealed class LocalizerTests
{
    [Fact]
    public void Returns_english_and_spanish_text()
    {
        var localizer = new Localizer(LanguageSetting.English);
        localizer.Get("Common.Action.Cancel").ShouldBe("Cancel");

        localizer.SetCulture(LanguageSetting.Spanish);
        localizer.Get("Common.Action.Cancel").ShouldBe("Cancelar");
    }

    [Fact]
    public void Formats_arguments_with_the_current_culture()
    {
        var localizer = new Localizer(LanguageSetting.Spanish);

        localizer.Get("Common.Items.Count", 1234.5).ShouldBe("1234,5 elementos");

        localizer.SetCulture(LanguageSetting.English);
        localizer.Get("Common.Items.Count", 1234.5).ShouldBe("1234.5 items");
    }

    [Fact]
    public void Raises_CultureChanged_only_when_the_culture_changes()
    {
        var localizer = new Localizer(LanguageSetting.English);
        var raised = 0;
        localizer.CultureChanged += (_, _) => raised++;

        localizer.SetCulture(LanguageSetting.English);
        localizer.SetCulture(LanguageSetting.Spanish);

        raised.ShouldBe(1);
    }

    [Fact]
    public void Unknown_key_returns_the_key_instead_of_throwing()
    {
        new Localizer(LanguageSetting.English).Get("No.Such.Key").ShouldBe("No.Such.Key");
    }

    [Fact]
    public void Unsupported_culture_falls_back_to_the_neutral_english_resources()
    {
        new Localizer(CultureInfo.GetCultureInfo("fr")).Get("Common.Action.Ok").ShouldBe("OK");
    }

    [Theory]
    [InlineData("es", "en", "es")]
    [InlineData("en", "es", "en")]
    [InlineData("system", "es-AR", "es")]
    [InlineData("system", "en-US", "en")]
    [InlineData("system", "fr-FR", "en")]
    [InlineData(null, "es-ES", "es")]
    [InlineData("garbage", "es-ES", "en")]
    public void Language_setting_resolves_to_a_supported_culture(string? setting, string system, string expected)
    {
        LanguageSetting.Resolve(setting, CultureInfo.GetCultureInfo(system)).TwoLetterISOLanguageName.ShouldBe(expected);
    }

    [Fact]
    public void Language_setting_round_trips()
    {
        LanguageSetting.Format(LanguageSetting.Spanish).ShouldBe("es");
        LanguageSetting.Format(LanguageSetting.English).ShouldBe("en");
        LanguageSetting.Format(null).ShouldBe("system");
    }
}
