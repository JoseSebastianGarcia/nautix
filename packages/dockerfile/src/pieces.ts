import { insertInstruction } from "./edit.js";

/** A ready-made group of instructions that snaps into a stage at any point. */
export interface Piece {
  id: PieceId;
  /** Which kind of stage it belongs in; the picker lists matching pieces first. */
  stage: "build" | "runtime" | "any";
  instructions: { keyword: string; args: string }[];
}

export type PieceId =
  | "dotnetRestore"
  | "dotnetPublish"
  | "aspnetPort"
  | "dotnetCultureInvariant"
  | "nonRoot"
  | "wgetHealthcheck"
  | "copyFromBuild";

export const PIECES: readonly Piece[] = [
  {
    id: "dotnetRestore",
    stage: "build",
    instructions: [
      { keyword: "COPY", args: "src/MyApp/MyApp.csproj src/MyApp/" },
      { keyword: "RUN", args: "dotnet restore src/MyApp/MyApp.csproj" },
    ],
  },
  {
    id: "dotnetPublish",
    stage: "build",
    instructions: [
      {
        keyword: "RUN",
        args: "dotnet publish src/MyApp/MyApp.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false",
      },
    ],
  },
  {
    id: "aspnetPort",
    stage: "runtime",
    instructions: [
      { keyword: "ENV", args: "ASPNETCORE_HTTP_PORTS=8080" },
      { keyword: "EXPOSE", args: "8080" },
    ],
  },
  {
    id: "dotnetCultureInvariant",
    stage: "runtime",
    instructions: [{ keyword: "ENV", args: "DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=true" }],
  },
  { id: "nonRoot", stage: "runtime", instructions: [{ keyword: "USER", args: "$APP_UID" }] },
  {
    id: "wgetHealthcheck",
    stage: "runtime",
    instructions: [
      {
        keyword: "HEALTHCHECK",
        args: "--interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1",
      },
    ],
  },
  {
    id: "copyFromBuild",
    stage: "runtime",
    instructions: [{ keyword: "COPY", args: "--from=build /app/publish ." }],
  },
];

/** Inserts every instruction of the piece, in order, before 1-based line `atLine`. */
export const insertPiece = (text: string, atLine: number, piece: Piece): string =>
  [...piece.instructions]
    .reverse()
    .reduce((acc, ins) => insertInstruction(acc, atLine, ins.keyword, ins.args), text);
