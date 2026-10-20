using System.Windows;
using Nodify;

namespace Nautix.Spikes.S2;

public partial class MainWindow : Window
{
    public MainWindow() => InitializeComponent();

    internal NodifyEditor GraphEditor => Editor;
}
