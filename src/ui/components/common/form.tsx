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
  readonly secret?: boolean;
  readonly choices?: readonly FieldChoice[];
  readonly suggestions?: readonly string[];
  readonly validate?: (
    value: string,
    values: Record<string, string>,
  ) => string | null;
  readonly visible?: (values: Record<string, string>) => boolean;
}

export interface FormProps {
  readonly fields: readonly FormField[];
  readonly onSubmit: (values: Record<string, string>) => void;
  readonly onCancel: () => void;
  readonly isActive?: boolean;
  readonly submitLabel?: string;
}

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

export function mustBeKnown(
  label: string,
  known: readonly string[],
  noun = "queue",
) {
  return (value: string) => {
    const trimmed = value.trim();
    if (trimmed === "") return `${label} is required.`;
    if (known.length === 0 || known.includes(trimmed)) return null;

    const near = known
      .filter((name) => name.toLowerCase().includes(trimmed.toLowerCase()))
      .slice(0, 3);

    return near.length > 0
      ? `No ${noun} named '${trimmed}'. Did you mean ${near.join(", ")}?`
      : `No ${noun} named '${trimmed}'.`;
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

  const suggestion = useMemo(() => {
    const options = current?.suggestions;
    if (options === undefined || current === undefined) return null;

    const value = values[current.name] ?? "";
    const needle = value.trim().toLowerCase();
    if (needle === "")
      return { matches: options, top: null, ghost: "", total: options.length };

    const prefix = options.filter((name) =>
      name.toLowerCase().startsWith(needle),
    );
    const rest = options.filter(
      (name) =>
        !name.toLowerCase().startsWith(needle) &&
        name.toLowerCase().includes(needle),
    );

    const matches = [...prefix, ...rest];
    const best = matches[0];
    const top = best === undefined || best === value ? null : (best ?? null);

    return {
      matches,
      top,

      ghost:
        top !== null && top.toLowerCase().startsWith(needle)
          ? top.slice(value.length)
          : "",
      total: options.length,
    };
  }, [current, values]);

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

      if (
        key.rightArrow &&
        current?.suggestions !== undefined &&
        suggestion?.top != null
      ) {
        setValue(current.name, suggestion.top);
        return;
      }

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
              <Text>
                <TextInput
                  value={value}
                  onChange={(next) => setValue(field.name, next)}
                  placeholder={field.placeholder ?? ""}
                  isActive={focused}
                  mask={field.secret === true}
                />
                {focused && suggestion !== null && suggestion.ghost !== "" ? (
                  <Text color={theme.muted} dimColor>
                    {suggestion.ghost}
                  </Text>
                ) : null}
              </Text>
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

      {}
      <Box flexDirection="column" marginTop={1}>
        {error !== null ? (
          <Text color={theme.danger}>{error}</Text>
        ) : suggestion === null ? (
          <Text> </Text>
        ) : (
          <Text color={theme.muted}>
            {suggestion.matches.length} of {suggestion.total} match
            {suggestion.matches.length === 0
              ? ""
              : `: ${suggestion.matches.slice(0, 4).join(", ")}${
                  suggestion.matches.length > 4 ? ", …" : ""
                }`}
            {suggestion.top === null ? "" : `  ${glyphs.arrowRight} complete`}
          </Text>
        )}

        <Text color={theme.muted}>
          tab/↑↓ move {glyphs.bullet} ⏎ {submitLabel} {glyphs.bullet} esc cancel
        </Text>
      </Box>
    </Box>
  );
}
