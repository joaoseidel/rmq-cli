import { Box, Text } from "ink";
import { useMemo, useState } from "react";
import { useCaptureInput } from "../../hooks/use-input-capture.tsx";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { glyphs, theme } from "../../theme.ts";
import { displayWidth } from "../../utils/width.ts";
import { TextInput } from "./text-input.tsx";

export interface FieldChoice {
  readonly value: string;
  readonly label: string;
}

export interface FormField {
  readonly name: string;
  readonly label: string;
  readonly initialValue?: string;
  readonly placeholder?: string;
  /** Renders input as asterisks. */
  readonly secret?: boolean;
  /** Turns the field into a left/right chooser instead of a text box. */
  readonly choices?: readonly FieldChoice[];
  /** Return a message to block submission, or null when the value is fine. */
  readonly validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null;
  /** Hides the field unless the predicate passes — for dependent options. */
  readonly visible?: (values: Record<string, string>) => boolean;
}

export interface FormProps {
  readonly fields: readonly FormField[];
  readonly onSubmit: (values: Record<string, string>) => void;
  readonly onCancel: () => void;
  readonly isActive?: boolean;
  readonly submitLabel?: string;
}

/**
 * Field validators.
 *
 * Shared rather than re-inlined per screen: "X is required." was written out ten
 * times across the form screens, which is ten chances for the wording to drift.
 */
export function required(label: string) {
  return (value: string) =>
    value.trim() === "" ? `${label} is required.` : null;
}

export function positiveInteger(label: string) {
  return (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0
      ? null
      : `${label} must be a positive whole number.`;
  };
}

export function port(label: string) {
  return (value: string) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
      return `${label} must be a port number between 1 and 65535.`;
    }
    return null;
  };
}

function initialValues(fields: readonly FormField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = field.initialValue ?? field.choices?.[0]?.value ?? "";
  }
  return values;
}

/**
 * Vertical form with tab/arrow navigation.
 *
 * Every action in the app that used to be a shell command with flags is entered
 * through one of these, so validation lives next to the field it guards and the
 * user finds out about a bad port or a missing host before anything touches the
 * broker.
 *
 * The form claims the keyboard while focused, so screen-level shortcuts do not
 * fire on characters typed into a field.
 */
export function Form({
  fields,
  onSubmit,
  onCancel,
  isActive = true,
  submitLabel = "submit",
}: FormProps) {
  const [values, setValues] = useState(() => initialValues(fields));
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useCaptureInput(isActive);

  const visible = useMemo(
    () => fields.filter((field) => field.visible?.(values) !== false),
    [fields, values],
  );

  const labelWidth = Math.max(
    ...visible.map((field) => displayWidth(field.label)),
    8,
  );
  const current = visible[Math.min(index, visible.length - 1)];

  const setValue = (name: string, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setError(null);
  };

  const submit = () => {
    for (const field of visible) {
      const message = field.validate?.(values[field.name] ?? "", values);
      if (message !== null && message !== undefined) {
        setError(message);
        setIndex(visible.indexOf(field));
        return;
      }
    }

    // Hidden fields are dropped so callers never see stale values from options
    // that were switched off.
    const submitted: Record<string, string> = {};
    for (const field of visible)
      submitted[field.name] = values[field.name] ?? "";
    onSubmit(submitted);
  };

  useKeyHandler(
    (input, key) => {
      if (key.escape) {
        onCancel();
        return;
      }

      if (key.tab || key.downArrow) {
        setIndex((value) => (value + 1) % visible.length);
        return;
      }

      if (key.upArrow) {
        setIndex((value) => (value - 1 + visible.length) % visible.length);
        return;
      }

      // Choice fields consume left/right; text fields never see them.
      if (current?.choices !== undefined && (key.leftArrow || key.rightArrow)) {
        const options = current.choices;
        const position = options.findIndex(
          (choice) => choice.value === values[current.name],
        );
        const next = key.rightArrow
          ? (position + 1) % options.length
          : (position - 1 + options.length) % options.length;
        setValue(current.name, options[next]?.value ?? "");
        return;
      }

      if (key.return) submit();
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      {visible.map((field, fieldIndex) => {
        const focused = isActive && fieldIndex === index;
        const value = values[field.name] ?? "";

        return (
          <Box key={field.name}>
            <Text color={focused ? theme.info : theme.muted}>
              {focused ? glyphs.cursor : " "}{" "}
              {field.label.padEnd(labelWidth)}{" "}
            </Text>

            {field.choices === undefined ? (
              <TextInput
                value={value}
                onChange={(next) => setValue(field.name, next)}
                placeholder={field.placeholder ?? ""}
                isActive={focused}
                mask={field.secret === true}
              />
            ) : (
              <Text>
                {field.choices.map((choice) => (
                  <Text
                    key={choice.value}
                    color={choice.value === value ? theme.info : theme.muted}
                    bold={choice.value === value}
                  >
                    {choice.value === value
                      ? `[${choice.label}] `
                      : `${choice.label} `}
                  </Text>
                ))}
                {focused ? <Text color={theme.muted}>← →</Text> : null}
              </Text>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        {error === null ? (
          <Text color={theme.muted}>
            tab/↑↓ move {glyphs.bullet} ⏎ {submitLabel} {glyphs.bullet} esc
            cancel
          </Text>
        ) : (
          <Text color={theme.danger}>{error}</Text>
        )}
      </Box>
    </Box>
  );
}
