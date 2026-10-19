using Nautix.SharedKernel;
using Shouldly;

namespace Nautix.SharedKernel.Tests;

public sealed class ErrorTests
{
    [Fact]
    public void Constructor_keeps_code_message_and_defaults_to_failure()
    {
        var error = new Error("containers.not_found", "No such container");

        error.Code.ShouldBe("containers.not_found");
        error.Message.ShouldBe("No such container");
        error.Kind.ShouldBe(ErrorKind.Failure);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_rejects_blank_code(string? code)
    {
        Should.Throw<ArgumentException>(() => new Error(code!, "message"));
    }

    [Fact]
    public void Factories_set_the_matching_kind()
    {
        Error.Validation("c", "m").Kind.ShouldBe(ErrorKind.Validation);
        Error.NotFound("c", "m").Kind.ShouldBe(ErrorKind.NotFound);
        Error.Conflict("c", "m").Kind.ShouldBe(ErrorKind.Conflict);
        Error.Cancelled().Kind.ShouldBe(ErrorKind.Cancelled);
        Error.Unexpected("c", "m").Kind.ShouldBe(ErrorKind.Unexpected);
    }

    [Fact]
    public void Errors_with_the_same_values_are_equal()
    {
        Error.NotFound("c", "m").ShouldBe(Error.NotFound("c", "m"));
    }
}
