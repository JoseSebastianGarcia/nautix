using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace Nautix.Spikes.S2;

/// <summary>Minimal INPC base. Nodify binds to view models; the product wraps this behind IGraphCanvas (spec 03/04).</summary>
internal abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}
