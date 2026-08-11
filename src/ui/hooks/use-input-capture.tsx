import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface CaptureControls {
  readonly acquire: () => void;
  readonly release: () => void;
}

const CaptureControlsContext = createContext<CaptureControls | null>(null);
const CaptureStateContext = createContext(false);

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

export function useInputCaptured(): boolean {
  return useContext(CaptureStateContext);
}

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
