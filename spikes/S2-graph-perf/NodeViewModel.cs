using System.Windows;
using System.Windows.Media;

namespace Nautix.Spikes.S2;

internal sealed class NodeViewModel(string title, string subtitle, NodeKind kind, Brush kindBrush, Brush statusBrush, Point location) : ObservableObject
{
    private Point _location = location;

    public string Title { get; } = title;

    public string Subtitle { get; } = subtitle;

    public NodeKind Kind { get; } = kind;

    public Brush KindBrush { get; } = kindBrush;

    public Brush StatusBrush { get; } = statusBrush;

    public ConnectorViewModel Input { get; } = new();

    public ConnectorViewModel Output { get; } = new();

    public Point Location
    {
        get => _location;
        set => Set(ref _location, value);
    }
}
