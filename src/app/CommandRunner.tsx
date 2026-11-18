import { createContext, useContext, type ReactNode } from "react";

export type RunCommand = (label: string, action: () => unknown) => Promise<void>;

const CommandContext = createContext<RunCommand>(async (_label, action) => {
  await action();
});

/** Provides a runner that executes UI commands, reporting failures to the status bar. */
export function CommandRunnerProvider({ run, children }: { run: RunCommand; children: ReactNode }) {
  return <CommandContext.Provider value={run}>{children}</CommandContext.Provider>;
}

export function useRunCommand(): RunCommand {
  return useContext(CommandContext);
}
