using System.ComponentModel;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Nautix.Ui.Generators;
using Nautix.Ui.Mvu;
using Shouldly;

namespace Nautix.Ui.Tests.Mvu;

public sealed class ViewStateGeneratorTests
{
    [Fact]
    public void Projection_exposes_state_properties_read_only()
    {
        using var store = new Store<CounterState>(new CounterState(3), CounterFeature.Update);
        using var view = new CounterViewState(store);

        view.Count.ShouldBe(3);
        view.Error.ShouldBeNull();
        view.CurrentState.ShouldBe(store.Current);
        typeof(CounterViewState).GetProperty(nameof(CounterViewState.Count))!.CanWrite.ShouldBeFalse();
    }

    [Fact]
    public void Property_changed_fires_only_for_properties_that_changed()
    {
        using var store = new Store<CounterState>(new CounterState(0), CounterFeature.Update);
        using var view = new CounterViewState(store);
        var raised = new List<string?>();
        ((INotifyPropertyChanged)view).PropertyChanged += (_, e) => raised.Add(e.PropertyName);

        store.Dispatch(new Increment());

        raised.ShouldBe([nameof(CounterViewState.Count), nameof(CounterViewState.CurrentState)]);
        view.Count.ShouldBe(1);
    }

    [Fact]
    public void Disposed_projection_stops_following_the_store()
    {
        using var store = new Store<CounterState>(new CounterState(0), CounterFeature.Update);
        var view = new CounterViewState(store);

        view.Dispose();
        store.Dispatch(new Increment());

        view.Count.ShouldBe(0);
    }

    [Fact]
    public void Non_partial_class_reports_NXVS001()
    {
        var diagnostics = Run("""
            using Nautix.Ui.Mvu;
            public sealed record S(int A);
            [GenerateViewState(typeof(S))]
            public sealed class NotPartial { }
            """);

        diagnostics.Select(d => d.Id).ShouldContain("NXVS001");
    }

    [Fact]
    public void Valid_class_generates_without_diagnostics()
    {
        var diagnostics = Run("""
            using Nautix.Ui.Mvu;
            public sealed record S(int A);
            [GenerateViewState(typeof(S))]
            public sealed partial class V;
            """);

        diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).ShouldBeEmpty();
    }

    private static IReadOnlyList<Diagnostic> Run(string source)
    {
        var references = ((string)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES")!)
            .Split(Path.PathSeparator)
            .Select(p => MetadataReference.CreateFromFile(p))
            .Append(MetadataReference.CreateFromFile(typeof(Store<>).Assembly.Location));
        var compilation = CSharpCompilation.Create(
            "generated",
            [CSharpSyntaxTree.ParseText(source)],
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, nullableContextOptions: NullableContextOptions.Enable));

        var driver = CSharpGeneratorDriver.Create(new ViewStateGenerator()).RunGeneratorsAndUpdateCompilation(
            compilation, out var output, out var generatorDiagnostics);
        return [.. generatorDiagnostics, .. output.GetDiagnostics()];
    }
}
