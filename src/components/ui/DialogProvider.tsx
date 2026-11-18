import { createContext, useCallback, useContext, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Dialog } from "./Dialog";

export interface PromptOptions {
  title: string;
  label: string;
  initialValue?: string;
  okLabel?: string;
  inputType?: "text" | "number";
  min?: number;
  max?: number;
  /** Return an error message to keep the dialog open. */
  validate?: (value: string) => string | null;
}

interface DialogApi {
  prompt(options: PromptOptions): Promise<string | null>;
  confirm(title: string, message: string, okLabel?: string): Promise<boolean>;
  /** Shows arbitrary content; `render` receives a close callback. */
  show(render: (close: () => void) => ReactNode): void;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialogs(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error("useDialogs must be used inside <DialogProvider>");
  return api;
}

function PromptDialog({ options, done }: { options: PromptOptions; done: (value: string | null) => void }) {
  const [value, setValue] = useState(options.initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const problem = options.validate?.(value) ?? null;
    if (problem) {
      setError(problem);
      return;
    }
    done(value);
  };
  return (
    <Dialog
      title={options.title}
      onClose={() => done(null)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => done(null)}>
            Cancel
          </button>
          <button type="submit" form="prompt-form" className="btn btn--primary">
            {options.okLabel ?? "OK"}
          </button>
        </>
      }
    >
      <form id="prompt-form" onSubmit={submit} className="field" noValidate>
        <label className="field__label" htmlFor="prompt-input">
          {options.label}
        </label>
        <input
          id="prompt-input"
          className="field__input"
          type={options.inputType ?? "text"}
          min={options.min}
          max={options.max}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={!!error}
          aria-describedby={error ? "prompt-error" : undefined}
        />
        {error && (
          <p id="prompt-error" className="field__error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<{ id: number; node: ReactNode }[]>([]);

  const push = useCallback((build: (close: () => void) => ReactNode) => {
    const id = Date.now() + Math.random();
    const close = () => setStack((s) => s.filter((d) => d.id !== id));
    setStack((s) => [...s, { id, node: build(close) }]);
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      prompt: (options) =>
        new Promise((resolve) =>
          push((close) => (
            <PromptDialog
              options={options}
              done={(v) => {
                close();
                resolve(v);
              }}
            />
          )),
        ),
      confirm: (title, message, okLabel = "OK") =>
        new Promise((resolve) =>
          push((close) => {
            const finish = (v: boolean) => {
              close();
              resolve(v);
            };
            return (
              <Dialog
                title={title}
                onClose={() => finish(false)}
                footer={
                  <>
                    <button type="button" className="btn" onClick={() => finish(false)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn--primary btn--danger" onClick={() => finish(true)}>
                      {okLabel}
                    </button>
                  </>
                }
              >
                <p className="dialog__text">{message}</p>
              </Dialog>
            );
          }),
        ),
      show: (render) => push(render),
    }),
    [push],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {stack.map((d) => (
        <div key={d.id}>{d.node}</div>
      ))}
    </DialogContext.Provider>
  );
}
