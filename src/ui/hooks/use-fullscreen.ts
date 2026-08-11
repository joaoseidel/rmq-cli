/** Switch to the alternate screen buffer, as full-screen terminal apps do. */
const ENTER_ALT_SCREEN = "\u001B[?1049h";
const LEAVE_ALT_SCREEN = "\u001B[?1049l";
const CLEAR_SCREEN = "\u001B[2J\u001B[H";

let active = false;

/**
 * Takes over the terminal using the alternate screen buffer.
 *
 * The alternate buffer is what gives a full-screen app its defining property:
 * the shell's scrollback is untouched, so quitting restores whatever the user
 * had on screen rather than burying it under a dump of frames.
 *
 * Restoration is registered against process teardown as well as unmount. A
 * crash, an uncaught rejection, or a SIGTERM that skipped React's cleanup would
 * otherwise leave the terminal stuck in the alternate buffer with a hidden
 * cursor — a broken shell the user has to `reset` by hand.
 */
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

  // `exit` covers normal termination; the signals cover Ctrl+C and kill, which
  // would otherwise bypass it.
  process.once("exit", restore);
  process.once("SIGINT", restore);
  process.once("SIGTERM", restore);
  process.once("SIGHUP", restore);

  return restore;
}
