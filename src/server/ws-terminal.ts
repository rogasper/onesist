const TERMINAL_PORT = parseInt(process.env.TERMINAL_PORT || "4323", 10);

export function getTerminalPort(): number {
  return TERMINAL_PORT;
}
