/**
 * Commands sent to the embedded terminal from elsewhere in the page ("Lanjutkan di
 * terminal" in the chat). The project page listens, asks before ending a running
 * terminal session, and hands the command to the terminal panel.
 */
const listeners = new Set<(command: string) => void>();

export function launchInTerminal(command: string): void {
  for (const listener of listeners) listener(command);
}

export function subscribeTerminalLaunch(listener: (command: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
