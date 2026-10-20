using Microsoft.Extensions.Logging;

namespace Nautix.EngineRelay;

/// <summary>
/// Holds one long-lived child inside the distro while it is needed, because WSL stops a distro that has no process
/// started from Windows and detached containers would die with it. Release is delayed so a burst of short
/// docker commands does not respawn the child each time.
/// </summary>
public sealed class DistroKeepAlive(Func<CancellationToken, ValueTask<IAsyncDisposable>> start, string distro, TimeSpan releaseDelay, ILogger logger) : IAsyncDisposable
{
    private readonly Lock _gate = new();
    private IAsyncDisposable? _handle;
    private CancellationTokenSource? _pendingRelease;
    private bool _disposed;

    public bool IsHeld
    {
        get
        {
            lock (_gate)
            {
                return _handle is not null;
            }
        }
    }

    public void Update(bool needed, string reason)
    {
        lock (_gate)
        {
            if (_disposed)
            {
                return;
            }

            if (needed)
            {
                CancelPendingRelease();
                if (_handle is null)
                {
                    _ = AcquireAsync(reason);
                }
            }
            else if (_handle is not null && _pendingRelease is null)
            {
                _pendingRelease = new CancellationTokenSource();
                _ = ReleaseLaterAsync(_pendingRelease.Token);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        IAsyncDisposable? handle;
        lock (_gate)
        {
            _disposed = true;
            CancelPendingRelease();
            handle = _handle;
            _handle = null;
        }

        if (handle is not null)
        {
            await handle.DisposeAsync().ConfigureAwait(false);
        }
    }

    private async Task AcquireAsync(string reason)
    {
        try
        {
            var handle = await start(CancellationToken.None).ConfigureAwait(false);
            var superseded = false;
            lock (_gate)
            {
                if (_disposed || _handle is not null)
                {
                    superseded = true;
                }
                else
                {
                    _handle = handle;
                }
            }

            if (superseded)
            {
                await handle.DisposeAsync().ConfigureAwait(false);
                return;
            }

            RelayLog.KeepAliveStarted(logger, distro, reason);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            RelayLog.KeepAliveFailed(logger, ex);
        }
    }

    private async Task ReleaseLaterAsync(CancellationToken ct)
    {
        try
        {
            await Task.Delay(releaseDelay, ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException)
        {
            return;
        }

        IAsyncDisposable? handle;
        lock (_gate)
        {
            handle = _handle;
            _handle = null;
            _pendingRelease?.Dispose();
            _pendingRelease = null;
        }

        if (handle is not null)
        {
            await handle.DisposeAsync().ConfigureAwait(false);
            RelayLog.KeepAliveReleased(logger);
        }
    }

    private void CancelPendingRelease()
    {
        _pendingRelease?.Cancel();
        _pendingRelease?.Dispose();
        _pendingRelease = null;
    }
}
