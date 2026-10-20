namespace Nautix.EngineRelay.Tests;

internal static class Eventually
{
    public static async Task TrueAsync(Func<bool> condition, string because, int timeoutSeconds = 20)
    {
        var deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (!condition())
        {
            if (DateTime.UtcNow > deadline)
            {
                throw new TimeoutException($"Condition not met within {timeoutSeconds}s: {because}");
            }

            await Task.Delay(20);
        }
    }
}
