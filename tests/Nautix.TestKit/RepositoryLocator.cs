namespace Nautix.TestKit;

public static class RepositoryLocator
{
    private static readonly Lazy<string> _root = new(FindRoot);

    public static string Root => _root.Value;

    public static string SourceDirectory => Path.Combine(Root, "src");

    public static string SolutionFile => Path.Combine(Root, "Nautix.sln");

    public static string Resolve(params string[] relative) => Path.Combine([Root, .. relative]);

    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "Nautix.sln")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName
            ?? throw new InvalidOperationException("Nautix.sln not found above " + AppContext.BaseDirectory);
    }
}
