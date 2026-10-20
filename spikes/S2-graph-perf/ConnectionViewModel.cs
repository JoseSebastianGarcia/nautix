using System.Windows.Media;

namespace Nautix.Spikes.S2;

internal sealed class ConnectionViewModel(ConnectorViewModel source, ConnectorViewModel target, Brush stroke)
{
    public ConnectorViewModel Source { get; } = source;

    public ConnectorViewModel Target { get; } = target;

    public Brush Stroke { get; } = stroke;
}
