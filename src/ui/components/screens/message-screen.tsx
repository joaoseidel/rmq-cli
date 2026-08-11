import { Box, Text } from "ink";
import { useMemo, useState } from "react";
import type { Message } from "../../../core/domain/message.ts";
import type { ActionId } from "../../actions.ts";
import { useKeyHandler } from "../../hooks/use-key-handler.ts";
import { useScreenKeys } from "../../hooks/use-screen-keys.ts";
import { glyphs, theme } from "../../theme.ts";
import { MessageDetail, formatPayloadLines } from "../parts/message-detail.tsx";

export interface MessageScreenProps {
  readonly message: Message;
  readonly onAction: (id: ActionId) => void;
  readonly width: number;
  readonly height: number;
  readonly isActive: boolean;
}

function metadataHeight(message: Message, verbose: boolean): number {
  const base = 4;
  if (!verbose) return base + 2;

  const headers = Object.keys(message.headers).length;
  const properties = Object.keys(message.properties).length;
  return (
    base +
    (headers > 0 ? headers + 2 : 0) +
    (properties > 0 ? properties + 2 : 0) +
    2
  );
}

export function MessageScreen({
  message,
  onAction,
  width,
  height,
  isActive,
}: MessageScreenProps) {
  const [offset, setOffset] = useState(0);
  const [showMetadata, setShowMetadata] = useState(true);

  const payloadLines = useMemo(
    () => formatPayloadLines(message.payload),
    [message.payload],
  );
  const totalLines = payloadLines.length;
  const windowHeight = Math.max(
    3,
    height - metadataHeight(message, showMetadata) - 2,
  );
  const maxOffset = Math.max(0, totalLines - windowHeight);
  const clipped = totalLines > windowHeight;

  useKeyHandler(
    (input, key) => {
      if (key.downArrow || input === "j")
        setOffset((current) => Math.min(maxOffset, current + 1));
      else if (key.upArrow || input === "k")
        setOffset((current) => Math.max(0, current - 1));
      else if (key.pageDown)
        setOffset((current) => Math.min(maxOffset, current + windowHeight));
      else if (key.pageUp)
        setOffset((current) => Math.max(0, current - windowHeight));
      else if (input === "g") setOffset(0);
      else if (input === "G") setOffset(maxOffset);
    },
    { isActive },
  );

  useScreenKeys("message", onAction, {
    isActive,
    local: { m: () => setShowMetadata((current) => !current) },
  });

  return (
    <Box flexDirection="column">
      <MessageDetail
        message={message}
        payloadLines={payloadLines}
        width={width}
        verbose={showMetadata}
        payloadWindow={{ offset, height: windowHeight }}
      />

      <Text color={theme.muted}>
        {clipped
          ? `${glyphs.bullet} lines ${offset + 1}–${Math.min(offset + windowHeight, totalLines)} of ${totalLines}`
          : `${glyphs.bullet} whole payload shown`}
      </Text>
    </Box>
  );
}
