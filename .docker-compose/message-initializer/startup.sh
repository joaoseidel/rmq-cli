#!/bin/bash

# Install required Python packages
pip install pika==1.2.0 requests==2.31.0

# Wait for RabbitMQ to be fully ready
echo "Waiting for RabbitMQ to be ready..."
sleep 15 # Increased wait time to ensure RabbitMQ is fully started

# Run the initialization script
echo "Starting message initialization..."
python /app/initialize_messages.py

echo "Message initialization completed successfully!"