using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace Nautix.Spikes.S4;

public partial class MainWindow : Window
{
    public MainWindow() => InitializeComponent();

    internal WebView2 WebView => Web;
}
