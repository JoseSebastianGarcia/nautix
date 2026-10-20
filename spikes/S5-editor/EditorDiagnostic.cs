namespace Nautix.Spikes.S5;

/// <summary>A diagnostic over a character range of the document (shape of docs/spec/04 <c>Diagnostic</c>, simplified).</summary>
internal sealed record EditorDiagnostic(string Code, DiagnosticSeverity Severity, int Offset, int Length, string Message);
