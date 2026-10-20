using System.Windows;

namespace Nautix.Spikes.S2;

internal sealed class ConnectorViewModel : ObservableObject
{
    private Point _anchor;
    private bool _isConnected;

    /// <summary>Written by Nodify (OneWayToSource) with the connector position in graph space.</summary>
    public Point Anchor
    {
        get => _anchor;
        set => Set(ref _anchor, value);
    }

    public bool IsConnected
    {
        get => _isConnected;
        set => Set(ref _isConnected, value);
    }
}
