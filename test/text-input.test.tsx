import { describe, expect, it } from "vitest";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { useState } from "react";
import { TextInput } from "../src/ui/components/common/text-input.tsx";
import { useKeyHandler } from "../src/ui/hooks/use-key-handler.ts";

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

function Controlled() {
  const [value, setValue] = useState("");
  return <TextInput value={value} onChange={setValue} isActive />;
}

describe("TextInput", () => {
  it("accumulates characters instead of replacing them", async () => {
    const { stdin, lastFrame } = render(<Controlled />);
    await settle();

    for (const character of "queue") {
      stdin.write(character);
      await settle();
    }

    expect(lastFrame()).toContain("queue");
  });

  it("deletes the last character on backspace", async () => {
    const { stdin, lastFrame } = render(<Controlled />);
    await settle();

    for (const character of "abc") {
      stdin.write(character);
      await settle();
    }
    stdin.write("\x7f");
    await settle();

    expect(lastFrame()).toContain("ab");
    expect(lastFrame()).not.toContain("abc");
  });

  it("masks a secret value", async () => {
    function Secret() {
      const [value, setValue] = useState("");
      return <TextInput value={value} onChange={setValue} isActive mask />;
    }

    const { stdin, lastFrame } = render(<Secret />);
    await settle();

    for (const character of "hunter2") {
      stdin.write(character);
      await settle();
    }

    expect(lastFrame()).toContain("*******");
    expect(lastFrame()).not.toContain("hunter2");
  });

  it("shows the placeholder only while empty", async () => {
    function WithPlaceholder() {
      const [value, setValue] = useState("");
      return (
        <TextInput
          value={value}
          onChange={setValue}
          placeholder="type here"
          isActive
        />
      );
    }

    const { stdin, lastFrame } = render(<WithPlaceholder />);
    await settle();
    expect(lastFrame()).toContain("type here");

    stdin.write("x");
    await settle();
    expect(lastFrame()).not.toContain("type here");
  });

  it("ignores control characters", async () => {
    const { stdin, lastFrame } = render(<Controlled />);
    await settle();

    stdin.write("a");
    await settle();

    stdin.write("\x01");
    await settle();

    expect(lastFrame()).toContain("a");
    expect(lastFrame()).not.toContain("\x01");
  });
});

describe("useKeyHandler", () => {
  it("invokes the current render's handler, not the first one", async () => {
    function Counter() {
      const [count, setCount] = useState(0);

      useKeyHandler((input) => {
        if (input === "+") setCount(count + 1);
      });
      return <Text>count={count}</Text>;
    }

    const { stdin, lastFrame } = render(<Counter />);
    await settle();

    for (let press = 0; press < 3; press += 1) {
      stdin.write("+");
      await settle();
    }

    expect(lastFrame()).toContain("count=3");
  });

  it("stops handling input when inactive", async () => {
    function Guarded() {
      const [count, setCount] = useState(0);
      useKeyHandler(() => setCount((value) => value + 1), { isActive: false });
      return <Text>count={count}</Text>;
    }

    const { stdin, lastFrame } = render(<Guarded />);
    await settle();

    stdin.write("x");
    await settle();

    expect(lastFrame()).toContain("count=0");
  });
});
