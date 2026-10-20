using Nautix.SharedKernel;

namespace Nautix.EngineRelay;

/// <summary>Command line: <c>--pipe</c>, <c>--control-pipe</c>, <c>--distro</c>, <c>--transport dial-stdio|socat</c>, <c>--keep-alive true|false</c>, <c>--mutex-name</c>.</summary>
public static class RelayArguments
{
    public static Result<RelayOptions> Parse(IReadOnlyList<string> args)
    {
        ArgumentNullException.ThrowIfNull(args);
        var options = new RelayOptions();
        for (var i = 0; i < args.Count; i += 2)
        {
            if (i + 1 >= args.Count)
            {
                return Invalid($"Option {args[i]} needs a value.");
            }

            var value = args[i + 1];
            switch (args[i])
            {
                case "--pipe":
                    options = options with { PipeName = value };
                    break;
                case "--control-pipe":
                    options = options with { ControlPipeName = value };
                    break;
                case "--mutex-name":
                    options = options with { MutexName = value };
                    break;
                case "--distro":
                    options = options with { Distro = value };
                    break;
                case "--transport" when value == "dial-stdio":
                    options = options with { Transport = EngineTransportKind.DialStdio };
                    break;
                case "--transport" when value == "socat":
                    options = options with { Transport = EngineTransportKind.Socat };
                    break;
                case "--transport":
                    return Invalid($"Unknown transport '{value}' (use dial-stdio or socat).");
                case "--keep-alive" when bool.TryParse(value, out var keepAlive):
                    options = options with { KeepAlive = keepAlive };
                    break;
                case "--keep-alive":
                    return Invalid("--keep-alive needs true or false.");
                default:
                    return Invalid($"Unknown option {args[i]}.");
            }
        }

        return Result.Success(options);
    }

    private static Result<RelayOptions> Invalid(string message) => Result.Failure<RelayOptions>(Error.Validation("relay.arguments", message));
}
