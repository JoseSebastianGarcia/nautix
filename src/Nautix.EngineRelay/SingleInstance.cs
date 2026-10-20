namespace Nautix.EngineRelay;

/// <summary>Per-user single instance via a named mutex (<c>Local\Nautix.EngineRelay</c>).</summary>
public sealed class SingleInstance : IDisposable
{
    private readonly Mutex _mutex;

    private SingleInstance(Mutex mutex) => _mutex = mutex;

    public static SingleInstance? TryAcquire(string name)
    {
        var mutex = new Mutex(initiallyOwned: true, name, out var createdNew);
        if (createdNew)
        {
            return new SingleInstance(mutex);
        }

        mutex.Dispose();
        return null;
    }

    public void Dispose()
    {
        try
        {
            _mutex.ReleaseMutex();
        }
        catch (ApplicationException)
        {
            // Released from a different thread than the one that acquired it: the OS frees it at process exit.
        }

        _mutex.Dispose();
    }
}
