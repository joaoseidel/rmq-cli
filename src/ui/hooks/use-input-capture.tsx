import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The claim operations, split from the claim *state* on purpose.
 *
 * `useCaptureInput` depends on these to run its effect. If they lived on the
 * same context value as `captured`, acquiring would change that value, re-run
 * the effect, release, and acquire again — an endless loop that re-renders the
 * app continuously and drops keystrokes. Keeping the functions on their own
 * context makes them referentially stable for the lifetime of the provider.
 */
interface CaptureControls {
  readonly acquire: () => void;
  readonly release: () => void;
}

const CaptureControlsContext = createContext<CaptureControls | null>(null);
const CaptureStateContext = createContext(false);

/**
 * Tracks whether a text field currently owns the keyboard.
 *
 * Ink delivers every keystroke to every mounted `useInput`, so a screen-level
 * shortcut and an open text field both see the same characters. Without an
 * explicit claim, typing "order-queue" into a filter would fire the `q` (quit)
 * and `c` (connections) shortcuts mid-word.
 *
 * Counted rather than boolean so nested fields cannot release each other's
 * claim.
 */
export function InputCaptureProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [holders, setHolders] = useState(0);

  const controls = useMemo<CaptureControls>(
    () => ({
      acquire: () => setHolders((count) => count + 1),
      release: () => setHolders((count) => Math.max(0, count - 1)),
    }),
    [],
  );

  return (
    <CaptureControlsContext.Provider value={controls}>
      <CaptureStateContext.Provider value={holders > 0}>
        {children}
      </CaptureStateContext.Provider>
    </CaptureControlsContext.Provider>
  );
}

/** True when a text field has the keyboard; shortcuts should stand down. */
export function useInputCaptured(): boolean {
  return useContext(CaptureStateContext);
}

/**
 * Claims the keyboard for as long as `active` is true.
 *
 * Release is tied to unmount as well as to `active` going false, so a screen
 * that navigates away mid-edit cannot leave the shortcuts disabled.
 */
export function useCaptureInput(active: boolean): void {
  const controls = useContext(CaptureControlsContext);

  const acquire = controls?.acquire;
  const release = controls?.release;

  useEffect(() => {
    if (!active || acquire === undefined || release === undefined) return;

    acquire();
    return release;
  }, [active, acquire, release]);
}
