using System.Windows.Data;
using System.Windows.Markup;

namespace Nautix.Ui.Wpf.Localization;

/// <summary>XAML access to resource strings: <c>Text="{loc:T Containers.Action.Start}"</c>. Re-evaluates on culture change.</summary>
[MarkupExtensionReturnType(typeof(string))]
public sealed class TExtension(string key) : MarkupExtension
{
    [ConstructorArgument("key")]
    public string Key { get; } = key;

    public override object ProvideValue(IServiceProvider serviceProvider)
    {
        var binding = new Binding($"[{Key}]")
        {
            Source = LocalizationSource.Instance,
            Mode = BindingMode.OneWay,
        };
        return binding.ProvideValue(serviceProvider);
    }
}
