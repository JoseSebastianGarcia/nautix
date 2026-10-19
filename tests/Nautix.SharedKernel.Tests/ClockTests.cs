using Nautix.SharedKernel;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.SharedKernel.Tests;

public sealed class ClockTests
{
    [Fact]
    public void System_clock_reports_utc_close_to_now()
    {
        var before = DateTimeOffset.UtcNow;

        var now = new SystemClock().UtcNow;

        now.Offset.ShouldBe(TimeSpan.Zero);
        now.ShouldBeInRange(before, DateTimeOffset.UtcNow);
    }

    [Fact]
    public void Fake_clock_only_moves_when_advanced()
    {
        var start = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        var clock = new FakeClock(start);

        clock.UtcNow.ShouldBe(start);
        clock.Advance(TimeSpan.FromMinutes(5));
        clock.UtcNow.ShouldBe(start.AddMinutes(5));
    }
}
