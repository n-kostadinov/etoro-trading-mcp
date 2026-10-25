import type { DiagnosticEvent, DiagnosticLevel } from "../transport/types.js";

const LEVEL_ORDER: Record<DiagnosticLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export function createStderrDiagnosticSink(
  minimumLevel: DiagnosticLevel,
  write: (text: string) => void = (text) => process.stderr.write(text),
): (event: DiagnosticEvent) => void {
  return (event) => {
    if (LEVEL_ORDER[event.level] > LEVEL_ORDER[minimumLevel]) {
      return;
    }
    try {
      write(`${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`);
    } catch {
      // Diagnostics must never break protocol handling.
    }
  };
}
