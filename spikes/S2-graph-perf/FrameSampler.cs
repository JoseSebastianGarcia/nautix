using System.Diagnostics;
using System.Windows.Media;

namespace Nautix.Spikes.S2;

/// <summary>
/// Measures real UI frame pacing: every <c>CompositionTarget.Rendering</c> callback applies one animation step and the
/// gap between callbacks is the frame time, so layout, connection geometry and render cost all show up in it.
/// </summary>
internal static class FrameSampler
{
    private const int WarmupFrames = 15;

    public static async Task<ScenarioStats> RunAsync(string name, TimeSpan duration, Action<double> step)
    {
        var frames = new List<double>(512);
        var completed = new TaskCompletionSource();
        var clock = Stopwatch.StartNew();
        TimeSpan? lastRenderingTime = null;
        double lastFrameAt = -1;
        var seen = 0;

        void OnRendering(object? sender, EventArgs e)
        {
            var renderingTime = ((RenderingEventArgs)e).RenderingTime;
            if (renderingTime == lastRenderingTime)
            {
                return;
            }

            lastRenderingTime = renderingTime;
            var now = clock.Elapsed.TotalMilliseconds;
            if (lastFrameAt >= 0 && ++seen > WarmupFrames)
            {
                frames.Add(now - lastFrameAt);
            }

            lastFrameAt = now;
            step(clock.Elapsed.TotalSeconds);
            if (clock.Elapsed >= duration)
            {
                completed.TrySetResult();
            }
        }

        CompositionTarget.Rendering += OnRendering;
        try
        {
            await completed.Task;
        }
        finally
        {
            CompositionTarget.Rendering -= OnRendering;
        }

        return ScenarioStats.From(name, frames);
    }
}
