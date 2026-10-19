namespace Nautix.Ui.Mvu;

public static class DelegateObserver
{
    public static IObserver<T> Create<T>(Action<T> onNext)
    {
        ArgumentNullException.ThrowIfNull(onNext);
        return new Observer<T>(onNext);
    }

    private sealed class Observer<T>(Action<T> onNext) : IObserver<T>
    {
        public void OnNext(T value) => onNext(value);

        public void OnError(Exception error) => throw error;

        public void OnCompleted()
        {
        }
    }
}
