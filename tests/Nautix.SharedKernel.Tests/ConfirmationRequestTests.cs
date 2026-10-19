using System.Collections.Immutable;
using Nautix.SharedKernel;
using Nautix.TestKit;
using Shouldly;

namespace Nautix.SharedKernel.Tests;

public sealed class ConfirmationRequestTests
{
    [Fact]
    public void Request_requires_an_operation_key_and_at_least_one_affected_object()
    {
        Should.Throw<ArgumentException>(() => new ConfirmationRequest(" ", ["a"]));
        Should.Throw<ArgumentException>(() => new ConfirmationRequest("containers.rm", []));
    }

    [Fact]
    public void Request_defaults_to_standard_level()
    {
        new ConfirmationRequest("containers.rm", ["web"]).Level.ShouldBe(ConfirmationLevel.Standard);
    }

    [Fact]
    public async Task Fake_policy_records_requests_and_returns_the_configured_answer()
    {
        var policy = new FakeConfirmationPolicy { Answer = false };
        var request = new ConfirmationRequest("images.prune", ["a", "b"], ConfirmationLevel.TwoStep);

        var confirmed = await policy.ConfirmAsync(request, CancellationToken.None);

        confirmed.ShouldBeFalse();
        policy.Requests.ShouldBe([request]);
    }

    [Fact]
    public void Destructive_request_exposes_its_confirmation()
    {
        IDestructive command = new RemoveContainersStub(["web", "db"]);

        command.Confirmation.AffectedObjects.ShouldBe(["web", "db"]);
    }

    private sealed record RemoveContainersStub(ImmutableArray<string> Names) : IDestructive
    {
        public ConfirmationRequest Confirmation => new("containers.rm", Names);
    }
}
