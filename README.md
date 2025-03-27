# RMQ-CLI

A powerful command-line interface for interacting with RabbitMQ. Manage connections, queues, and messages with ease
through a simple and intuitive command-line experience.

## Overview

RMQ-CLI is a command-line tool written in Kotlin that provides comprehensive management capabilities for RabbitMQ
message brokers. The tool follows a domain-driven design approach with a clean architecture, making it both powerful and
maintainable.

This project was born out of the need for advanced message handling capabilities that aren't available in the official
RabbitMQ CLI. When working with complex messaging systems, I frequently needed to:

- Search for specific message content across multiple queues
- Reprocess failed messages by republishing them to their original exchanges
- Requeue messages from one queue to another to handle backpressure
- Export messages from multiple queues for analysis and debugging
- Filter queues using glob patterns to easily manage systems with many queues

The official RabbitMQ CLI is excellent for basic administrative tasks, but it lacks these sophisticated message handling
features that are essential for day-to-day operations in production environments. RMQ-CLI fills this gap by providing a
rich set of commands specifically designed for message-level operations and advanced queue management.

## Features

- **Connection Management**: Add, list, remove and set default connections to RabbitMQ brokers
- **VHost Management**: List and set default virtual hosts
- **Queue Operations**: List, search, inspect, purge, consume, export and more
- **Message Operations**: Publish, inspect, search, requeue, reprocess and delete messages
- **Native Executables**: Builds to native executables for multiple platforms using GraalVM

## Installation

### Download Pre-built Binary

The easiest way to install RMQ-CLI is to download the pre-built binary for your platform from
the [releases page](https://github.com/joaoseidel/rmq-cli/releases).

### Build from Source

You can also build RMQ-CLI from source:

```bash
# Clone the repository
git clone https://github.com/joaoseidel/rmq-cli.git
cd rmq-cli

# Build the project (creates a native executable)
./gradlew nativeCompile

# The executable will be available at
# rmq-cli-app/build/native/nativeCompile/rmq
```

## Usage

Each command supports the `--help` flag to display usage information:

```bash
rmq --help                   # Show main help
rmq connection --help        # Show connection command help
rmq queue --help             # Show queue command help
rmq message --help           # Show message command help
```

### Connection Management

Before using RMQ-CLI, you need to configure a connection to your RabbitMQ broker:

```bash
# Get help on connection add command
rmq connection add --help

# Add a new connection
rmq connection add local-dev --host localhost --username rabbitmq --password rabbitmq --vhost / --type amqp

# List all connections
rmq connection list

# Set a connection as default
rmq connection set-default local-dev

# Remove a connection
rmq connection remove local-dev
```

### Virtual Host Management

```bash
# Get help on vhost commands
rmq connection vhost --help

# List all virtual hosts
rmq connection vhost list

# Set a default virtual host for a connection
rmq connection vhost set-default my-vhost
```

### Queue Operations

```bash
# Get help on queue commands
rmq queue --help

# List all queues
rmq queue list

# List queues matching a pattern using the --pattern parameter
rmq queue list --pattern "temp.*"

# Search for queues matching a pattern (returns queues, not messages)
rmq queue search "service-*"

# Search for queues matching a pattern
rmq queue search "user.*"

# Glob pattern examples:
# Match queues starting with 'order':
rmq queue search "order*"
# Match queues ending with 'failed':
rmq queue search "*failed"
# Match queues with exactly 5 characters:
rmq queue search "?????"
# Match queues with 'event' anywhere in the name:
rmq queue search "*event*"

# Inspect a specific queue
rmq queue inspect my-queue

# Consume messages from a queue
rmq queue consume my-queue --ack

# Export messages from a queue to a file
rmq queue export my-queue --output messages.json --limit 100

# Export from multiple queues by treating the queue name as a pattern
rmq queue export "order.*" --pattern --output orders.json --limit 50

# Export all messages from error queues (acknowledging them after export)
rmq queue export "error.*" --pattern --output errors.json --limit 100 --ack

# Purge a queue (remove all messages)
rmq queue purge my-queue

# Requeue messages from one queue to another
rmq queue requeue --from source-queue --to destination-queue --all

# Reprocess messages (publish back to their original exchange)
rmq queue reprocess --from my-queue --all
```

### Message Operations

```bash
# Get help on message commands
rmq message --help

# Get help on message publish command
rmq message publish --help

# Publish a message to a queue
rmq message publish --queue my-queue --payload '{"key": "value"}'

# Publish a message to an exchange with routing key
rmq message publish --exchange my-exchange --routing-key user.created --payload '{"id": 123}'

# Search for messages containing specific content
rmq message search "error" --queue my-queue

# Glob pattern examples for message searching:
# Search for JSON messages with a specific property:
rmq message search "*\"status\":\"failed\"*" --queue orders
# Search for XML messages with error tags:
rmq message search "*<error>*" --queue notifications
# Search messages containing a specific ID:
rmq message search "*id-12345*" --queue events
# Search for error messages (glob pattern is converted to regex):
rmq message search "*error*" --queue logs

# Inspect a specific message
rmq message inspect message-id my-queue

# Requeue a message to another queue
rmq message requeue message-id --from source-queue --to destination-queue

# Reprocess a message (publish back to original exchange/routing key)
rmq message reprocess message-id --from my-queue

# Delete a message
rmq message delete message-id my-queue
```

## Pattern Matching Parameters

The RMQ-CLI offers several parameters for pattern matching when working with queues and messages:

- `--pattern`: Used to treat the provided string as a pattern for queue names
- `--queue-pattern`: Used to filter queues by name pattern while searching for messages
- `--global`: Used to search across all queues in the virtual host

### Examples Using Queue Patterns

```bash
# List queues matching a pattern
rmq queue list --pattern "service.*"

# Search for messages containing "error" in queues matching a pattern
rmq message search "error" --queue-pattern "log.*"

# Search for messages in all queues (use with caution on busy brokers)
rmq message search "critical" --global

# Export messages from multiple queues matching a pattern
rmq queue export --queue-pattern "order.*" --output orders.json

# Reprocess all messages from a specific queue
rmq queue reprocess --from retry-queue --all
```

## Glob Pattern Syntax

The RMQ-CLI supports basic glob patterns for searching queues and messages. Here's a quick reference for the syntax:

- `*`: Matches any number of characters (including zero)
- `?`: Matches exactly one character

Note: The implementation converts glob patterns to regular expressions internally. Specifically, it:

1. Escapes periods (`.` → `\.`)
2. Converts asterisks (`*` → `.*`)
3. Converts question marks (`?` → `.`)

The code does not specifically implement character class support (`[abc]` or `[a-z]`), though these may work in some
cases through the regular expression conversion.

### Examples

| Pattern   | Matches                                | Doesn't Match               |
|-----------|----------------------------------------|-----------------------------|
| `order*`  | `order`, `orders`, `order-processing`  | `my-order`, `reorder`       |
| `*event*` | `event`, `events`, `new-event-handler` | none                        |
| `user-?`  | `user-A`, `user-1`                     | `user-`, `user-admin`       |
| `????`    | `user`, `test`, `1234`                 | `a`, `toolong`              |
| `*.error` | `app.error`, `system.error`            | `error`, `system.error.log` |

You can use these patterns with several commands including `queue list`, `queue search`, `message search`, and
`queue export`.

## Connection Type Support

RMQ-CLI supports two main types of connections to RabbitMQ:

- **AMQP** (`--type amqp`): For full messaging operations, including real-time consumption
- **HTTP** (`--type http`): For management operations through RabbitMQ's HTTP API

### AMQP Connection

```bash
# See all options for adding a connection
rmq connection add --help

rmq connection add local-amqp --host localhost --username guest --password guest --vhost / --type amqp --amqp-port 5672 --http-port 15672
```

The AMQP connection supports all functionalities and is recommended for most use cases.

### HTTP Connection

```bash
rmq connection add local-http --host localhost --username guest --password guest --vhost / --type http --http-port 15672
```

The HTTP connection is limited to management operations and does not support:

- Real-time message consumption
- Some advanced message handling operations

## Configuration

RMQ-CLI stores connection settings in `~/.rmq-cli/settings.json`. These settings are managed automatically through the
CLI commands.

## Development

### Prerequisites

- JDK 23 or higher
- GraalVM Community Edition (for native compilation)
- Gradle 8.x

### Building the Project

```bash
# Build the project
./gradlew build

# Run the application
./gradlew run

# Create a native executable
./gradlew nativeCompile
```

### Project Structure

- `rmq-cli-core`: Core domain models and interfaces
- `rmq-cli-clikt`: CLI implementation using the Clikt library
- `rmq-cli-app`: Main application and adapter implementations

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request