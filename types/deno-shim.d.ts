// Minimal ambient `Deno` declaration for the APP's typechecker only.
//
// The app imports `AppType` (type-only) from the Deno edge function to get full
// Hono RPC inference. That pulls the function's source into type resolution,
// which references `Deno.*`. The app never RUNS this code — Deno does — so a
// minimal shim keeps `tsc` happy without dragging in @types/deno. The real Deno
// types are used when the functions are checked with `deno check`.
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => unknown;
  env: { get(key: string): string | undefined };
};
