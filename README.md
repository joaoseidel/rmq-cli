# RMQ-CLI

A powerful command-line interface for interacting with RabbitMQ. Manage connections, queues, and messages with ease through a simple and intuitive command-line experience.

## Overview

RMQ-CLI is a command-line tool written in Kotlin that provides comprehensive management capabilities for RabbitMQ message brokers. The tool follows a domain-driven design approach with a clean architecture, making it both powerful and maintainable.

## Features

- **Connection Management**: Add, list, remove and set default connections to RabbitMQ brokers
- **VHost Management**: List and set default virtual hosts
- **Queue Operations**: List, search, inspect, purge, consume, export and more
- **Message Operations**: Publish, inspect, search, requeue, reprocess and delete messages
- **Native Executables**: Builds to native executables for multiple platforms using GraalVM

## Installation

### Download Pre-built Binary

The easiest way to install RMQ-CLI is to download the pre-built binary for your platform from the [releases page](https://github.com/joaoseidel/rmq-cli/releases).

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

### Connection Management

Before using RMQ-CLI, you need to configure a connection to your RabbitMQ broker:

```bash
# Add a new connection
rmq connection add local-dev --host localhost --port 5672 --username rabbitmq --password rabbitmq --vhost /

# List all connections
rmq connection list

# Set a connection as default
rmq connection set-default local-dev

# Remove a connection
rmq connection remove local-dev
```

### Virtual Host Management

```bash
# List all virtual hosts
rmq connection vhost list

# Set a default virtual host for a connection
rmq connection vhost set-default my-vhost
```

### Queue Operations

```bash
# List all queues
rmq queue list

# Search for queues matching a pattern
rmq queue search "user.*"

# Inspect a specific queue
rmq queue inspect my-queue

# Consume messages from a queue
rmq queue consume my-queue --ack

# Export messages from a queue to a file
rmq queue export my-queue --output messages.json --limit 100

# Purge a queue (remove all messages)
rmq queue purge my-queue

# Requeue messages from one queue to another
rmq queue requeue --from source-queue --to destination-queue --all

# Reprocess messages (publish back to their original exchange)
rmq queue reprocess --from my-queue --all
```

### Message Operations

```bash
# Publish a message to a queue
rmq message publish --queue my-queue --payload '{"key": "value"}'

# Publish a message to an exchange with routing key
rmq message publish --exchange my-exchange --routing-key user.created --payload '{"id": 123}'

# Search for messages containing specific content
rmq message search "error" --queue my-queue

# Inspect a specific message
rmq message inspect message-id my-queue

# Requeue a message to another queue
rmq message requeue message-id --from source-queue --to destination-queue

# Reprocess a message (publish back to original exchange/routing key)
rmq message reprocess message-id --from my-queue

# Delete a message
rmq message delete message-id my-queue
```

## Configuration

RMQ-CLI stores connection settings in `~/.rmq-cli/settings.json`. These settings are managed automatically through the CLI commands.

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
