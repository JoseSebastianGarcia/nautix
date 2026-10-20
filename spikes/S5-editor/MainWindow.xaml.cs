using System.Windows;

namespace Nautix.Spikes.S5;

public partial class MainWindow : Window
{
    public MainWindow() => InitializeComponent();

    internal ICSharpCode.AvalonEdit.TextEditor TextEditor => Editor;

    internal System.Windows.Controls.Button DarkToggle => DarkButton;

    internal System.Windows.Controls.Button LightToggle => LightButton;

    internal System.Windows.Controls.Button ValidSample => ValidButton;

    internal System.Windows.Controls.Button BrokenSample => BrokenButton;

    internal System.Windows.Controls.Button BigSample => BigButton;
}
