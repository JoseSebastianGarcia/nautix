using Nautix.Spikes.S1.Editing;

namespace Nautix.Spikes.S1.Verification;

internal sealed record EditSite(string Kind, YamlPath Path, ComposeEdit Edit);
