using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Media;

namespace Nautix.Spikes.S2;

/// <summary>Deterministic synthetic topology shaped like a compose/network graph: layered columns, 2 outgoing edges per node.</summary>
internal sealed class GraphViewModel
{
    public const int Columns = 15;
    public const int Rows = 20;
    public const int EdgeCount = 600;
    public const double ColumnSpacing = 300;
    public const double RowSpacing = 110;

    public ObservableCollection<NodeViewModel> Nodes { get; } = [];

    public ObservableCollection<ConnectionViewModel> Connections { get; } = [];

    public static GraphViewModel Generate(Func<string, Brush> brush)
    {
        ArgumentNullException.ThrowIfNull(brush);
        var graph = new GraphViewModel();
        var random = new Random(20261020);
        var kinds = new[] { NodeKind.Service, NodeKind.Service, NodeKind.Service, NodeKind.Volume, NodeKind.Config, NodeKind.Network };
        var statuses = new[] { "Nx.LimeStrong", "Nx.LimeStrong", "Nx.Amber", "Nx.Danger", "Nx.TextDim" };

        for (var column = 0; column < Columns; column++)
        {
            for (var row = 0; row < Rows; row++)
            {
                var kind = kinds[random.Next(kinds.Length)];
                var kindBrush = brush(kind switch
                {
                    NodeKind.Service => "Nx.Lime",
                    NodeKind.Network => "Nx.Cyan",
                    NodeKind.Volume => "Nx.Violet",
                    _ => "Nx.Amber",
                });
                var index = (column * Rows) + row;
                graph.Nodes.Add(new NodeViewModel(
                    $"{kind}-{index}",
                    $"image:{random.Next(1, 20)}.{random.Next(0, 9)}",
                    kind,
                    kindBrush,
                    brush(statuses[random.Next(statuses.Length)]),
                    new Point(column * ColumnSpacing, row * RowSpacing)));
            }
        }

        var seen = new HashSet<(int, int)>();
        var stroke = brush("Nx.Cyan");
        while (graph.Connections.Count < EdgeCount)
        {
            var column = random.Next(Columns - 1);
            var from = (column * Rows) + random.Next(Rows);
            var to = ((column + 1) * Rows) + random.Next(Rows);
            if (!seen.Add((from, to)))
            {
                continue;
            }

            graph.Nodes[from].Output.IsConnected = true;
            graph.Nodes[to].Input.IsConnected = true;
            graph.Connections.Add(new ConnectionViewModel(graph.Nodes[from].Output, graph.Nodes[to].Input, stroke));
        }

        return graph;
    }
}
