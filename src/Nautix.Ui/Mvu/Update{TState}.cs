using System.Collections.Immutable;

namespace Nautix.Ui.Mvu;

/// <summary>Pure reducer: no I/O, no clock, no randomness, no tasks.</summary>
public delegate (TState State, ImmutableArray<IEffect> Effects) Update<TState>(TState state, IMsg msg);
