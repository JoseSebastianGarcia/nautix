using Nautix.Ui.Mvu;
using Shouldly;

namespace Nautix.Ui.Tests.Mvu;

public sealed class StoreTests
{
    private static Store<CounterState> NewStore(SynchronizationContext? context = null)
    {
        var runner = new EffectRunnerBuilder()
            .Add(new DelayedIncrementHandler())
            .Add(new ExplodeHandler())
            .Build();
        return new Store<CounterState>(new CounterState(0), CounterFeature.Update, runner, context);
    }

    [Fact]
    public void Reducer_is_pure_and_testable_without_a_store()
    {
        var (state, effects) = CounterFeature.Update(new CounterState(1), new Increment(2));

        state.Count.ShouldBe(3);
        effects.ShouldBeEmpty();
    }

    [Fact]
    public void Dispatch_updates_current_state()
    {
        using var store = NewStore();

        store.Dispatch(new Increment());
        store.Dispatch(new Increment(5));

        store.Current.Count.ShouldBe(6);
    }

    [Fact]
    public void Subscribe_emits_current_state_then_each_change()
    {
        using var store = NewStore();
        var seen = new List<int>();
        using var subscription = store.Subscribe(new ListObserver(seen));

        store.Dispatch(new Increment());
        store.Dispatch(new Increment());

        seen.ShouldBe([0, 1, 2]);
    }

    [Fact]
    public void Unchanged_state_does_not_notify()
    {
        using var store = NewStore();
        var seen = new List<int>();
        using var subscription = store.Subscribe(new ListObserver(seen));

        store.Dispatch(new Increment(0));

        seen.ShouldBe([0]);
    }

    [Fact]
    public void Disposed_subscription_stops_receiving()
    {
        using var store = NewStore();
        var seen = new List<int>();
        var subscription = store.Subscribe(new ListObserver(seen));

        subscription.Dispose();
        store.Dispatch(new Increment());

        seen.ShouldBe([0]);
    }

    [Fact]
    public async Task Effects_run_and_dispatch_follow_up_messages()
    {
        using var store = NewStore();

        store.Dispatch(new IncrementLater(7));
        await store.WhenIdleAsync();

        store.Current.Count.ShouldBe(7);
    }

    [Fact]
    public async Task Handler_exception_becomes_an_EffectFailed_message()
    {
        using var store = NewStore();

        store.Dispatch(new Fail());
        await store.WhenIdleAsync();

        store.Current.Error.ShouldBe("boom");
    }

    [Fact]
    public void Effect_without_a_runner_is_a_programmer_error()
    {
        using var store = new Store<CounterState>(new CounterState(0), CounterFeature.Update);

        Should.Throw<InvalidOperationException>(() => store.Dispatch(new IncrementLater(1)));
    }

    [Fact]
    public async Task Unregistered_effect_surfaces_as_EffectFailed()
    {
        var runner = new EffectRunnerBuilder().Build();
        using var store = new Store<CounterState>(
            new CounterState(0),
            (s, m) => m is Fail ? (s, [new Unhandled()]) : CounterFeature.Update(s, m),
            runner);

        store.Dispatch(new Fail());
        await store.WhenIdleAsync();

        store.Current.Error!.ShouldContain(nameof(Unhandled));
    }

    [Fact]
    public async Task Concurrent_dispatch_loses_no_message_and_reduces_serially()
    {
        using var store = NewStore();
        const int Threads = 8;
        const int PerThread = 2_000;

        await Task.WhenAll(Enumerable.Range(0, Threads).Select(_ => Task.Run(() =>
        {
            for (var i = 0; i < PerThread; i++)
            {
                store.Dispatch(new Increment());
            }
        })));
        await store.WhenIdleAsync();

        store.Current.Count.ShouldBe(Threads * PerThread);
    }

    [Fact]
    public void Dispatch_from_an_observer_is_queued_not_reentrant()
    {
        using var store = NewStore();
        var order = new List<string>();
        using var subscription = store.Subscribe(new CallbackObserver(s =>
        {
            order.Add($"saw {s.Count}");
            if (s.Count == 1)
            {
                store.Dispatch(new Increment());
                order.Add("after nested dispatch");
            }
        }));

        store.Dispatch(new Increment());

        store.Current.Count.ShouldBe(2);
        order.ShouldBe(["saw 0", "saw 1", "after nested dispatch", "saw 2"]);
    }

    [Fact]
    public void Observers_are_notified_through_the_given_synchronization_context()
    {
        var context = new RecordingContext();
        using var store = NewStore(context);
        using var subscription = store.Subscribe(new ListObserver([]));

        store.Dispatch(new Increment());

        context.PostCount.ShouldBe(2); // initial emission + change
    }

    [Fact]
    public void Dispatch_after_dispose_is_ignored()
    {
        var store = NewStore();
        store.Dispose();

        store.Dispatch(new Increment());

        store.Current.Count.ShouldBe(0);
    }

    [Fact]
    public void Duplicate_handler_registration_is_rejected()
    {
        var builder = new EffectRunnerBuilder().Add(new DelayedIncrementHandler());

        Should.Throw<InvalidOperationException>(() => builder.Add(new DelayedIncrementHandler()));
    }

    private sealed class ListObserver(List<int> seen) : IObserver<CounterState>
    {
        public void OnNext(CounterState value) => seen.Add(value.Count);

        public void OnError(Exception error) => throw error;

        public void OnCompleted()
        {
        }
    }

    private sealed class CallbackObserver(Action<CounterState> onNext) : IObserver<CounterState>
    {
        public void OnNext(CounterState value) => onNext(value);

        public void OnError(Exception error) => throw error;

        public void OnCompleted()
        {
        }
    }

    private sealed class RecordingContext : SynchronizationContext
    {
        public int PostCount { get; private set; }

        public override void Post(SendOrPostCallback d, object? state)
        {
            PostCount++;
            d(state);
        }
    }
}
