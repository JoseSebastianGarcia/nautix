namespace Nautix.Ui.Mvu;

/// <summary>
/// Marks a partial class for which <c>Nautix.Ui.Generators</c> emits a read-only INotifyPropertyChanged
/// projection of <paramref name="stateType"/>. Never hand-write these projections.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class GenerateViewStateAttribute(Type stateType) : Attribute
{
    public Type StateType { get; } = stateType;
}
