const ENTER_ALT_SCREEN = "\u001B[?1049h";
const LEAVE_ALT_SCREEN = "\u001B[?1049l";
const CLEAR_SCREEN = "\u001B[2J\u001B[H";

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
    process.stdout.write(LEAVE_ALT_SCREEN);
  };

  process.once("exit", restore);
  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);
  process.once("SIGHUP", restore);

  return restore;
}
