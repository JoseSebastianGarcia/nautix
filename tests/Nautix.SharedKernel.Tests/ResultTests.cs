using Nautix.SharedKernel;
using Shouldly;

namespace Nautix.SharedKernel.Tests;

public sealed class ResultTests
{
    private static readonly Error _boom = Error.Failure("test.boom", "boom");

    [Fact]
    public void Success_has_no_error()
    {
        var result = Result.Success();

        result.IsSuccess.ShouldBeTrue();
        result.IsFailure.ShouldBeFalse();
        Should.Throw<InvalidOperationException>(() => result.Error);
    }

    [Fact]
    public void Failure_exposes_the_error()
    {
        var result = Result.Failure(_boom);

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(_boom);
    }

    [Fact]
    public void Success_of_T_exposes_the_value()
    {
        var result = Result.Success(42);

        result.IsSuccess.ShouldBeTrue();
        result.Value.ShouldBe(42);
        Should.Throw<InvalidOperationException>(() => result.Error);
    }

    [Fact]
    public void Failure_of_T_throws_when_reading_the_value()
    {
        var result = Result.Failure<int>(_boom);

        result.IsFailure.ShouldBeTrue();
        result.Error.ShouldBe(_boom);
        Should.Throw<InvalidOperationException>(() => result.Value);
    }

    [Fact]
    public void Failure_rejects_null_error()
    {
        Should.Throw<ArgumentNullException>(() => Result.Failure(null!));
        Should.Throw<ArgumentNullException>(() => Result.Failure<int>(null!));
    }

    [Fact]
    public void Map_transforms_success_and_skips_failure()
    {
        Result.Success(2).Map(x => x * 10).Value.ShouldBe(20);

        var mapperCalled = false;
        var failed = Result.Failure<int>(_boom).Map(x =>
        {
            mapperCalled = true;
            return x;
        });

        failed.Error.ShouldBe(_boom);
        mapperCalled.ShouldBeFalse();
    }

    [Fact]
    public void Bind_chains_results_and_short_circuits_on_first_failure()
    {
        Result.Success(2).Bind(x => Result.Success(x + 1)).Value.ShouldBe(3);
        Result.Success(2).Bind(_ => Result.Failure<int>(_boom)).Error.ShouldBe(_boom);
        Result.Failure<int>(_boom).Bind(x => Result.Success(x + 1)).Error.ShouldBe(_boom);
    }

    [Fact]
    public void Match_selects_the_branch()
    {
        Result.Success(5).Match(v => $"ok {v}", e => e.Code).ShouldBe("ok 5");
        Result.Failure<int>(_boom).Match(v => $"ok {v}", e => e.Code).ShouldBe("test.boom");
    }

    [Fact]
    public void GetValueOrDefault_returns_fallback_on_failure()
    {
        Result.Success(5).GetValueOrDefault(-1).ShouldBe(5);
        Result.Failure<int>(_boom).GetValueOrDefault(-1).ShouldBe(-1);
    }

    [Fact]
    public void ToResult_drops_the_value_and_keeps_the_error()
    {
        Result.Success(5).ToResult().IsSuccess.ShouldBeTrue();
        Result.Failure<int>(_boom).ToResult().Error.ShouldBe(_boom);
    }
}
