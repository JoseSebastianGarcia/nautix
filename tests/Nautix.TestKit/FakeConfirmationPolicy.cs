using Nautix.SharedKernel;

namespace Nautix.TestKit;

public sealed class FakeConfirmationPolicy : IConfirmationPolicy
{
    private readonly List<ConfirmationRequest> _requests = [];

    public bool Answer { get; set; } = true;

    public IReadOnlyList<ConfirmationRequest> Requests => _requests;

    public ValueTask<bool> ConfirmAsync(ConfirmationRequest request, CancellationToken ct)
    {
        _requests.Add(request);
        return ValueTask.FromResult(Answer);
    }
}
