/** The thread a transcript belongs to, for cards deep inside it that call thread routes. */
import { createContext, useContext, type ReactNode } from "react";

const ThreadIdContext = createContext<string | null>(null);

export function ThreadIdProvider({ value, children }: { value: string; children: ReactNode }) {
  return <ThreadIdContext.Provider value={value}>{children}</ThreadIdContext.Provider>;
}

export function useThreadId(): string | null {
  return useContext(ThreadIdContext);
}
