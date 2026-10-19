using System.Collections.Concurrent;
using System.Collections.Immutable;

namespace Nautix.Ui.Mvu;

/// <summary>
/// One store per feature screen. <see cref="Dispatch"/> is thread-safe; messages are reduced one at a time,
/// in arrival order, by whichever thread currently holds the drain. Observers are notified on
/// <c>observerContext</c> when given (the UI synchronization context), so handlers never touch the Dispatcher.
/// </summary>
public sealed class Store<TState> : IObservable<TState>, IDisposable
    where TState : class
{
    private readonly Update<TState> _update;
    private readonly IEffectRunner? _effects;
    private readonly SynchronizationContext? _observerContext;
    private readonly ConcurrentQueue<IMsg> _queue = new();
    private readonly ConcurrentDictionary<Task, byte> _running = new();
    private readonly CancellationTokenSource _cancellation = new();
    private readonly Lock _observersGate = new();
    private ImmutableArray<IObserver<TState>> _observers = [];
    private TState _current;
    private int _draining;
    private int _disposed;

    public Store(
        TState initial,
        Update<TState> update,
        IEffectRunner? effects = null,
        SynchronizationContext? observerContext = null)
    {
        ArgumentNullException.ThrowIfNull(update);
        _current = initial;
        _update = update;
        _effects = effects;
        _observerContext = observerContext;
    }

    public TState Current => Volatile.Read(ref _current);

    public void Dispatch(IMsg msg)
    {
        ArgumentNullException.ThrowIfNull(msg);
        if (Volatile.Read(ref _disposed) == 1)
        {
            return;
        }

        _queue.Enqueue(msg);
        Drain();
    }

    public IDisposable Subscribe(IObserver<TState> observer)
    {
        ArgumentNullException.ThrowIfNull(observer);
        lock (_observersGate)
        {
            _observers = _observers.Add(observer);
        }

        Notify(observer, Current);
        return new Subscription(this, observer);
    }

    /// <summary>Completes when the queue is empty and no effect is running (including effects started meanwhile).</summary>
    public async Task WhenIdleAsync()
    {
        while (true)
        {
            var pending = _running.Keys.ToArray();
            if (pending.Length == 0 && _queue.IsEmpty)
            {
                return;
            }

            await Task.WhenAll(pending).ConfigureAwait(false);
            await Task.Yield();
        }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref _disposed, 1) == 1)
        {
            return;
        }

        _cancellation.Cancel();
        lock (_observersGate)
        {
            _observers = [];
        }

        _cancellation.Dispose();
    }

    private void Drain()
    {
        // The re-check after releasing the flag closes the window where a message arrives between the last
        // TryDequeue and the release, which would otherwise be stranded.
        while (!_queue.IsEmpty)
        {
            if (Interlocked.CompareExchange(ref _draining, 1, 0) != 0)
            {
                return;
            }

            try
            {
                while (_queue.TryDequeue(out var msg))
                {
                    Reduce(msg);
                }
            }
            finally
            {
                Interlocked.Exchange(ref _draining, 0);
            }
        }
    }

    private void Reduce(IMsg msg)
    {
        var previous = _current;
        var (next, effects) = _update(previous, msg);
        Volatile.Write(ref _current, next);

        if (!EqualityComparer<TState>.Default.Equals(previous, next))
        {
            foreach (var observer in _observers)
            {
                Notify(observer, next);
            }
        }

        foreach (var effect in effects.IsDefault ? [] : effects)
        {
            Start(effect);
        }
    }

    private void Notify(IObserver<TState> observer, TState state)
    {
        if (_observerContext is null)
        {
            observer.OnNext(state);
        }
        else
        {
            _observerContext.Post(_ => observer.OnNext(state), null);
        }
    }

    private void Start(IEffect effect)
    {
        var runner = _effects ?? throw new InvalidOperationException(
            $"Update returned effect {effect.GetType().Name} but the store has no effect runner.");
        var token = _cancellation.Token;

        var task = Task.Run(
            async () =>
            {
                try
                {
                    await runner.RunAsync(effect, Dispatch, token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (token.IsCancellationRequested)
                {
                    // Store disposed: cancellation is the expected way out.
                }
#pragma warning disable CA1031 // Effect boundary: any handler fault is translated into a message, never lost.
                catch (Exception ex)
#pragma warning restore CA1031
                {
                    Dispatch(new EffectFailed(effect, ex));
                }
            },
            CancellationToken.None);

        _running.TryAdd(task, 0);
        _ = task.ContinueWith(
            t => _running.TryRemove(t, out _),
            CancellationToken.None,
            TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    private void Unsubscribe(IObserver<TState> observer)
    {
        lock (_observersGate)
        {
            _observers = _observers.Remove(observer);
        }
    }

    private sealed class Subscription(Store<TState> store, IObserver<TState> observer) : IDisposable
    {
        public void Dispose() => store.Unsubscribe(observer);
    }
}
