import { Text } from "ink";
import { memo, useState } from "react";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { theme } from "../../theme.ts";

export interface TextInputProps {
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly onCancel?: () => void;
  readonly placeholder?: string;
  readonly isActive?: boolean;
  readonly mask?: boolean;
}

const CURSOR = "▏";

function TextInputComponent({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder = "",
  isActive = true,
  mask = false,
}: TextInputProps) {
  const [internal, setInternal] = useState("");
  const current = value ?? internal;

  const update = (next: string) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };

  useKeyHandler(
    (input, key) => {
      if (key.return) {
        onSubmit?.(current);
        return;
      }

      if (key.escape) {
        onCancel?.();
        return;
      }

      if (key.backspace || key.delete) {
        update(current.slice(0, -1));
        return;
      }

      if (key.ctrl && input === "u") {
        update("");
        return;
      }

      if (key.ctrl || key.meta || input === "") return;
      if (/[\u0000-\u001f\u007f]/.test(input)) return;

      update(current + input);
    },
    { isActive },
  );

  const display = mask ? "*".repeat(current.length) : current;

  return (
    <Text>
      {current === "" && placeholder !== "" ? (
        <Text color={theme.muted}>{placeholder}</Text>
      ) : (
        <Text>{display}</Text>
      )}
      {isActive ? <Text color={theme.info}>{CURSOR}</Text> : null}
    </Text>
  );
}

export const TextInput = memo(TextInputComponent);
