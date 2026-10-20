namespace Nautix.Spikes.S1.Corpus;

internal static class RepositoryPaths
{
    public static string Root { get; } = FindRoot();

    public static string ComposeCorpus => Path.Combine(Root, "corpus", "compose");

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Nautix.sln")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new InvalidOperationException("Run from inside the Nautix repository.");
    }
}
