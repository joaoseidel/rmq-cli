const ENTER_ALT_SCREEN = "\u001B[?1049h";
const LEAVE_ALT_SCREEN = "\u001B[?1049l";
const CLEAR_SCREEN = "\u001B[2J\u001B[H";
const SHOW_CURSOR = "\u001B[?25h";

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"] as const;

let active = false;

export function enterFullscreen(): () => void {
  if (active) return () => {};
  active = true;

  process.stdout.write(ENTER_ALT_SCREEN);
  process.stdout.write(CLEAR_SCREEN);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    active = false;

    try {
      if (process.stdin.isTTY === true) process.stdin.setRawMode(false);
    } catch {}

    process.stdout.write(LEAVE_ALT_SCREEN);
    process.stdout.write(SHOW_CURSOR);
  };

  process.once("exit", restore);
  for (const signal of SIGNALS) process.once(signal, restore);

  return restore;
}
