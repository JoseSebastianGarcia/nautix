import { describe, expect, it } from "vitest";
import { lintDockerfile } from "./lint.js";
import { insertPiece, PIECES } from "./pieces.js";

describe("pieces", () => {
  it("inserts a multi-instruction piece in order at the given line", () => {
    const piece = PIECES.find((p) => p.id === "dotnetRestore");
    if (!piece) throw new Error("missing piece");
    const out = insertPiece(
      'FROM mcr.microsoft.com/dotnet/sdk:10.0\nWORKDIR /src\nCMD ["x"]\n',
      3,
      piece,
    );
    expect(out.split("\n")).toEqual([
      "FROM mcr.microsoft.com/dotnet/sdk:10.0",
      "WORKDIR /src",
      "COPY src/MyApp/MyApp.csproj src/MyApp/",
      "RUN dotnet restore src/MyApp/MyApp.csproj",
      'CMD ["x"]',
      "",
    ]);
  });

  it("every piece produces instructions the linter parses without errors", () => {
    for (const piece of PIECES) {
      const text = insertPiece("FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build\n", 2, piece);
      expect(lintDockerfile(text).filter((i) => i.severity === "error")).toEqual([]);
    }
  });
});
