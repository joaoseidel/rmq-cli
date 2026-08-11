import { Box, Text } from "ink";
import { useState } from "react";
import {
  ConnectionInfoSchema,
  type ConnectionInfo,
} from "../../../core/domain/connection.ts";
import { vHost } from "../../../core/domain/vhost.ts";
import type { ConnectionOperations } from "../../../core/usecase/connection-operations.ts";
import { errorMessage } from "../../../core/util/text.ts";
import {
  useActionResult,
  useAsyncAction,
} from "../../hooks/use-async-action.ts";
import { theme } from "../../theme.ts";
import { Form, port, required, type FormField } from "../common/form.tsx";
import { Spinner } from "../parts/spinner.tsx";
import { StatusMessage } from "../parts/status-message.tsx";

export interface ConnectionFormScreenProps {
  readonly connections: ConnectionOperations;
  readonly onSaved: (connection: ConnectionInfo) => void;
  readonly onCancel: () => void;
  readonly isActive: boolean;
}

const FIELDS: FormField[] = [
  {
    name: "name",
    label: "Name",
    placeholder: "local-dev",
    validate: required("Name"),
  },
  {
    name: "host",
    label: "Host",
    initialValue: "localhost",
    validate: required("Host"),
  },
  {
    name: "type",
    label: "Protocol",
    choices: [
      { value: "amqp", label: "AMQP" },
      { value: "http", label: "HTTP" },
    ],
  },
  {
    name: "username",
    label: "Username",
    initialValue: "guest",
    validate: required("Username"),
  },
  {
    name: "password",
    label: "Password",
    initialValue: "guest",
    secret: true,
    validate: required("Password"),
  },
  {
    name: "vhost",
    label: "Virtual host",
    initialValue: "/",
    validate: required("Virtual host"),
  },
  {
    name: "amqpPort",
    label: "AMQP port",
    initialValue: "5672",
    validate: port("AMQP port"),

    visible: (values) => values["type"] === "amqp",
  },
  {
    name: "httpPort",
    label: "HTTP port",
    initialValue: "15672",
    validate: port("HTTP port"),
  },
  {
    name: "ssl",
    label: "TLS",
    choices: [
      { value: "no", label: "off" },
      { value: "yes", label: "on" },
    ],
  },
];

function buildConnection(values: Record<string, string>): ConnectionInfo {
  const base = {
    name: values["name"] ?? "",
    host: values["host"] ?? "",
    username: values["username"] ?? "",
    password: values["password"] ?? "",
    vHost: vHost(values["vhost"] ?? "/"),
    useSsl: values["ssl"] === "yes",

    isDefault: true,
    httpPort: Number(values["httpPort"] ?? 15672),
  };

  return values["type"] === "http"
    ? ConnectionInfoSchema.parse({ ...base, type: "http" })
    : ConnectionInfoSchema.parse({
        ...base,
        type: "amqp",
        amqpPort: Number(values["amqpPort"] ?? 5672),
      });
}

export function ConnectionFormScreen({
  connections,
  onSaved,
  onCancel,
  isActive,
}: ConnectionFormScreenProps) {
  const [pendingConnection, setPendingConnection] =
    useState<ConnectionInfo | null>(null);

  const save = useAsyncAction(async (connection: ConnectionInfo) => {
    const added = await connections.addConnection(connection);
    if (!added) {
      throw new Error(
        `Could not reach ${connection.host} as '${connection.username}'. Check the host, port, and credentials.`,
      );
    }
    return connection;
  });

  useActionResult(save.state, onSaved);

  if (save.state.status === "success") {
    return <StatusMessage tone="success">Saved.</StatusMessage>;
  }

  if (save.state.status === "running") {
    return (
      <Spinner
        label={`Testing connection to ${pendingConnection?.host ?? ""}…`}
      />
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.muted}>
        The connection is tested before it is saved.
      </Text>
      <Box height={1} />

      {save.state.status === "failure" ? (
        <Box marginBottom={1}>
          <StatusMessage tone="danger">
            {errorMessage(save.state.error)}
          </StatusMessage>
        </Box>
      ) : null}

      <Form
        fields={FIELDS}
        isActive={isActive}
        submitLabel="save"
        onCancel={onCancel}
        onSubmit={(values) => {
          const connection = buildConnection(values);
          setPendingConnection(connection);
          save.run(connection);
        }}
      />
    </Box>
  );
}
