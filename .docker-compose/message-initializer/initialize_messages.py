#!/usr/bin/env python3
"""
RabbitMQ Message Initializer

This script connects to RabbitMQ and publishes a variety of predefined messages
with different combinations of AMQP properties to help test the RMQ-CLI tool
against messages with diverse property sets.
"""

import json
import time
import logging
import pika
import requests
from requests.auth import HTTPBasicAuth
from datetime import datetime, timedelta
import uuid
import base64
import gzip

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("message-initializer")

# Connection parameters
RABBITMQ_HOST = 'rabbitmq'
RABBITMQ_PORT = 5672
RABBITMQ_HTTP_PORT = 15672
RABBITMQ_USERNAME = 'rabbitmq'
RABBITMQ_PASSWORD = 'rabbitmq'

# List of vhosts to initialize
VHOSTS = ['/', 'teste-one', 'teste-two']

# HTTP API endpoint
RABBITMQ_API_URL = f'http://{RABBITMQ_HOST}:{RABBITMQ_HTTP_PORT}/api'

def connect_to_rabbitmq(vhost='/'):
    """Establish connection to RabbitMQ with the specified vhost"""
    connection_params = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        virtual_host=vhost,
        credentials=pika.PlainCredentials(RABBITMQ_USERNAME, RABBITMQ_PASSWORD),
        heartbeat=600,
        connection_attempts=5,
        retry_delay=5
    )

    connection = pika.BlockingConnection(connection_params)
    channel = connection.channel()
    return connection, channel

def wait_for_rabbitmq():
    """Wait until RabbitMQ is available"""
    max_retries = 30
    retry_interval = 5

    for attempt in range(max_retries):
        try:
            # Try to connect to the default vhost
            connection, _ = connect_to_rabbitmq()
            connection.close()
            logger.info("RabbitMQ is available!")
            return True
        except Exception as e:
            logger.warning(f"Waiting for RabbitMQ to be available... Attempt {attempt+1}/{max_retries}")
            time.sleep(retry_interval)

    logger.error("Could not connect to RabbitMQ after multiple attempts")
    return False

def ensure_vhosts_exist():
    """Make sure all required virtual hosts exist, creating them if necessary"""
    logger.info("Ensuring all virtual hosts exist")

    # First check which vhosts already exist
    try:
        response = requests.get(
            f"{RABBITMQ_API_URL}/vhosts",
            auth=HTTPBasicAuth(RABBITMQ_USERNAME, RABBITMQ_PASSWORD)
        )
        response.raise_for_status()

        existing_vhosts = [vhost['name'] for vhost in response.json()]
        logger.info(f"Found existing vhosts: {existing_vhosts}")

        # Create any missing vhosts
        for vhost in VHOSTS:
            if vhost not in existing_vhosts:
                logger.info(f"Creating missing vhost: {vhost}")

                # Create the vhost via API
                create_response = requests.put(
                    f"{RABBITMQ_API_URL}/vhosts/{vhost}",
                    auth=HTTPBasicAuth(RABBITMQ_USERNAME, RABBITMQ_PASSWORD),
                    json={"description": f"Created by message initializer"}
                )
                create_response.raise_for_status()

                # Set permissions for the rabbitmq user on this vhost
                perm_response = requests.put(
                    f"{RABBITMQ_API_URL}/permissions/{vhost}/rabbitmq",
                    auth=HTTPBasicAuth(RABBITMQ_USERNAME, RABBITMQ_PASSWORD),
                    json={"configure": ".*", "write": ".*", "read": ".*"}
                )
                perm_response.raise_for_status()

                logger.info(f"Successfully created vhost: {vhost}")

        return True
    except Exception as e:
        logger.error(f"Error ensuring vhosts exist: {e}")

        # Fall back to rabbitmqctl commands via direct connection
        try:
            logger.info("Attempting to create vhosts using direct connection...")
            connection, channel = connect_to_rabbitmq()
            for vhost in VHOSTS:
                if vhost != '/':  # Skip default vhost as it always exists
                    logger.info(f"Trying direct method to create vhost: {vhost}")
                    # We can't directly create a vhost through AMQP, but we can try to connect to it
                    # If it fails, we'll handle it in the initialization process
            connection.close()
        except Exception as inner_e:
            logger.error(f"Direct vhost creation attempt also failed: {inner_e}")

        return False

def create_standard_messages(channel, queue_name):
    """Publish standard test messages with basic properties"""

    # Basic JSON message
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"messageType": "standard", "content": "Simple JSON message"}).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            delivery_mode=2  # persistent
        )
    )

    # Plain text message
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body="This is a plain text message".encode(),
        properties=pika.BasicProperties(
            content_type='text/plain',
            delivery_mode=1  # non-persistent
        )
    )

    # XML message
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body='<message><type>standard</type><content>XML test message</content></message>'.encode(),
        properties=pika.BasicProperties(
            content_type='application/xml',
            delivery_mode=2
        )
    )

def create_messages_with_all_properties(channel, queue_name):
    """Publish messages with all possible AMQP properties"""

    # Message with all standard properties
    message_id = str(uuid.uuid4())
    correlation_id = str(uuid.uuid4())

    # Create a message with a subset of properties that are more reliably supported
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({
            "messageType": "complete",
            "id": message_id,
            "description": "Message with all AMQP properties set"
        }).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            content_encoding='utf-8',
            headers={
                'custom-header-1': 'value1',
                'custom-header-2': 'value2',
                # Nested array structures might not be fully supported across all clients
                # so we use simple headers for better compatibility
                'x-death-count': 1,
                'x-death-reason': 'rejected',
                'x-first-death-exchange': '',
                'x-first-death-queue': 'some-queue',
            },
            delivery_mode=2,  # persistent
            priority=5,  # 0-9
            correlation_id=correlation_id,
            reply_to='response-queue',
            expiration='60000',  # 60 seconds
            message_id=message_id,
            timestamp=int(datetime.now().timestamp()),
            type='test.message',
            # user_id must match the authenticated user connecting to RabbitMQ
            user_id='rabbitmq',
            app_id='message-initializer',
            # cluster_id is deprecated in newer AMQP versions, so we skip it
        )
    )

    # Message with binary content and gzip encoding
    try:
        binary_data = b'Some binary data with \x00\x01\x02\x03 bytes'
        compressed_data = gzip.compress(binary_data)

        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=compressed_data,
            properties=pika.BasicProperties(
                content_type='application/octet-stream',
                content_encoding='gzip',
                headers={'original-size': str(len(binary_data))},  # Convert to string to ensure compatibility
                delivery_mode=2
            )
        )
    except Exception as e:
        logger.warning(f"Could not publish binary message: {e}")
        # Fallback to a simpler message
        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=b'Binary data placeholder',
            properties=pika.BasicProperties(
                content_type='application/octet-stream',
                delivery_mode=2
            )
        )

    # Message with Base64 encoded content
    try:
        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=base64.b64encode(json.dumps({"key": "value"}).encode()),
            properties=pika.BasicProperties(
                content_type='application/json',
                content_encoding='base64',
                headers={'encoding': 'base64'}
            )
        )
    except Exception as e:
        logger.warning(f"Could not publish base64 encoded message: {e}")
        # Fallback to a plain message
        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=json.dumps({"key": "value", "encoding": "none"}).encode(),
            properties=pika.BasicProperties(
                content_type='application/json'
            )
        )

def create_messages_with_custom_headers(channel, queue_name):
    """Publish messages with various custom headers"""

    # Message with nested headers
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"content": "Message with nested headers"}).encode(),
        properties=pika.BasicProperties(
            headers={
                'x-custom': {
                    'nested': {
                        'value': 123,
                        'array': [1, 2, 3]
                    }
                },
                'routing': {
                    'region': 'us-west',
                    'datacenter': 'dc1'
                }
            }
        )
    )

    # Message with array in headers
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"content": "Message with array headers"}).encode(),
        properties=pika.BasicProperties(
            headers={
                'tags': ['important', 'production', 'customer'],
                'priorities': [1, 2, 3]
            }
        )
    )

    # Message with numeric and boolean headers
    # Note: Floating point values must be converted to strings for AMQP headers
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"content": "Message with typed headers"}).encode(),
        properties=pika.BasicProperties(
            headers={
                'int-value': 42,
                'float-value-as-string': str(3.14159),  # Convert float to string
                'boolean-true': True,
                'boolean-false': False,
                'null-value': None
            }
        )
    )

def create_messages_expiration_and_priority(channel, queue_name):
    """Publish messages with different TTL and priority values"""

    # Message that expires in 1 minute
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"content": "Short expiration (1 minute)"}).encode(),
        properties=pika.BasicProperties(
            expiration='60000'  # 60 seconds
        )
    )

    # Message that expires in 1 hour
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"content": "Medium expiration (1 hour)"}).encode(),
        properties=pika.BasicProperties(
            expiration='3600000'  # 1 hour
        )
    )

    # Messages with different priorities
    for priority in [0, 3, 5, 9]:
        channel.basic_publish(
            exchange='',
            routing_key=queue_name,
            body=json.dumps({"content": f"Message with priority {priority}"}).encode(),
            properties=pika.BasicProperties(
                priority=priority
            )
        )

def create_rpc_style_messages(channel, queue_name):
    """Publish messages simulating request-reply pattern"""

    # RPC request message
    request_id = str(uuid.uuid4())
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({
            "jsonrpc": "2.0",
            "method": "getUser",
            "params": {"userId": 123},
            "id": request_id
        }).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            correlation_id=request_id,
            reply_to='response-queue',
            type='rpc.request'
        )
    )

    # RPC response message
    response_id = str(uuid.uuid4())
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({
            "jsonrpc": "2.0",
            "result": {"userId": 123, "name": "John Doe", "email": "john@example.com"},
            "id": request_id
        }).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            correlation_id=request_id,
            type='rpc.response'
        )
    )

def create_messages_with_timestamps(channel, queue_name):
    """Publish messages with different timestamp values"""

    # Current timestamp
    current_time = datetime.now()

    # Message with current timestamp
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"event": "current", "timestamp": current_time.isoformat()}).encode(),
        properties=pika.BasicProperties(
            timestamp=int(current_time.timestamp())
        )
    )

    # Message with past timestamp (1 day ago)
    past_time = current_time - timedelta(days=1)
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"event": "past", "timestamp": past_time.isoformat()}).encode(),
        properties=pika.BasicProperties(
            timestamp=int(past_time.timestamp())
        )
    )

    # Message with future timestamp (1 day from now)
    future_time = current_time + timedelta(days=1)
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({"event": "future", "timestamp": future_time.isoformat()}).encode(),
        properties=pika.BasicProperties(
            timestamp=int(future_time.timestamp())
        )
    )

def create_error_messages(channel, queue_name):
    """Publish messages that represent different types of errors"""

    # Message representing a validation error
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({
            "error": "ValidationError",
            "message": "Invalid input data",
            "details": {"field": "email", "constraint": "format"}
        }).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            type='error.validation',
            headers={'severity': 'warning'}
        )
    )

    # Message representing a system error
    channel.basic_publish(
        exchange='',
        routing_key=queue_name,
        body=json.dumps({
            "error": "DatabaseError",
            "message": "Connection pool exhausted",
            "stackTrace": "..."
        }).encode(),
        properties=pika.BasicProperties(
            content_type='application/json',
            type='error.system',
            headers={'severity': 'critical'}
        )
    )

def initialize_vhost(vhost):
    """Initialize a specific vhost with test messages"""
    logger.info(f"Initializing vhost: {vhost}")

    try:
        connection, channel = connect_to_rabbitmq(vhost)
    except Exception as e:
        logger.error(f"Failed to connect to vhost {vhost}: {e}")
        # Try to create the vhost using the HTTP API if it doesn't exist
        try:
            create_response = requests.put(
                f"{RABBITMQ_API_URL}/vhosts/{vhost}",
                auth=HTTPBasicAuth(RABBITMQ_USERNAME, RABBITMQ_PASSWORD),
                json={"description": f"Created by message initializer during initialization"}
            )
            create_response.raise_for_status()

            # Set permissions for the rabbitmq user on this vhost
            perm_response = requests.put(
                f"{RABBITMQ_API_URL}/permissions/{vhost}/rabbitmq",
                auth=HTTPBasicAuth(RABBITMQ_USERNAME, RABBITMQ_PASSWORD),
                json={"configure": ".*", "write": ".*", "read": ".*"}
            )
            perm_response.raise_for_status()

            logger.info(f"Created vhost {vhost} on-the-fly, now connecting...")

            # Wait a moment for the vhost to be ready
            time.sleep(2)

            # Try connecting again
            connection, channel = connect_to_rabbitmq(vhost)
        except Exception as inner_e:
            logger.error(f"Failed to create vhost {vhost}: {inner_e}")
            raise

    try:
        # Define test queues if they don't already exist
        if vhost == '/':
            test_queues = ['test-queue', 'test-queue-2', 'order-processing', 'order-failed', 'user-events']
            exchanges = [('order-exchange', 'topic'), ('user-exchange', 'topic')]
        elif vhost == 'teste-one':
            test_queues = ['test-queue', 'error-queue']
            exchanges = [('error-exchange', 'fanout')]
        elif vhost == 'teste-two':
            test_queues = ['test-queue', 'notification-queue']
            exchanges = [('notification-exchange', 'topic')]

        # Ensure queues exist
        for queue in test_queues:
            channel.queue_declare(queue=queue, durable=True)

        # Ensure exchanges exist
        for exchange, exchange_type in exchanges:
            channel.exchange_declare(exchange=exchange, exchange_type=exchange_type, durable=True)

        # Publish messages to each queue
        for queue in test_queues:
            try:
                # Publish various types of test messages
                create_standard_messages(channel, queue)
                logger.debug(f"Created standard messages for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating standard messages for queue {queue}: {e}")

            try:
                create_messages_with_all_properties(channel, queue)
                logger.debug(f"Created messages with all properties for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating messages with all properties for queue {queue}: {e}")

            try:
                create_messages_with_custom_headers(channel, queue)
                logger.debug(f"Created messages with custom headers for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating messages with custom headers for queue {queue}: {e}")

            try:
                create_messages_expiration_and_priority(channel, queue)
                logger.debug(f"Created messages with expiration and priority for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating messages with expiration and priority for queue {queue}: {e}")

            try:
                create_rpc_style_messages(channel, queue)
                logger.debug(f"Created RPC style messages for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating RPC style messages for queue {queue}: {e}")

            try:
                create_messages_with_timestamps(channel, queue)
                logger.debug(f"Created messages with timestamps for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating messages with timestamps for queue {queue}: {e}")

            try:
                create_error_messages(channel, queue)
                logger.debug(f"Created error messages for queue: {queue}")
            except Exception as e:
                logger.error(f"Error creating error messages for queue {queue}: {e}")

            logger.info(f"Published test messages to queue: {queue}")

        # Create some messages for specific use cases in exchanges
        try:
            if vhost == '/':
                # Order messages
                channel.basic_publish(
                    exchange='order-exchange',
                    routing_key='order.created',
                    body=json.dumps({
                        "orderId": "ORD-100",
                        "customer": "CUST-200",
                        "items": [{"productId": "PROD-1", "quantity": 2}]
                    }).encode(),
                    properties=pika.BasicProperties(content_type='application/json')
                )

                channel.basic_publish(
                    exchange='order-exchange',
                    routing_key='order.failed',
                    body=json.dumps({
                        "orderId": "ORD-101",
                        "reason": "payment_failed",
                        "errorCode": "ERR-501"
                    }).encode(),
                    properties=pika.BasicProperties(content_type='application/json')
                )

                # User messages
                channel.basic_publish(
                    exchange='user-exchange',
                    routing_key='user.created',
                    body=json.dumps({
                        "userId": "USER-100",
                        "email": "user@example.com"
                    }).encode(),
                    properties=pika.BasicProperties(content_type='application/json')
                )

            elif vhost == 'teste-one':
                # Error messages
                channel.basic_publish(
                    exchange='error-exchange',
                    routing_key='',  # Fanout exchange doesn't need routing key
                    body=json.dumps({
                        "service": "payment-service",
                        "errorCode": "ERR-101",
                        "message": "Payment gateway timeout"
                    }).encode(),
                    properties=pika.BasicProperties(content_type='application/json')
                )

            elif vhost == 'teste-two':
                # Notification messages
                channel.basic_publish(
                    exchange='notification-exchange',
                    routing_key='notification.email',
                    body=json.dumps({
                        "recipient": "user@example.com",
                        "subject": "Your order has shipped",
                        "body": "Your order #12345 has been shipped..."
                    }).encode(),
                    properties=pika.BasicProperties(content_type='application/json')
                )

            logger.info(f"Published exchange-specific messages for vhost: {vhost}")
        except Exception as e:
            logger.error(f"Error publishing exchange-specific messages for vhost {vhost}: {e}")

    finally:
        connection.close()
        logger.info(f"Finished initializing vhost: {vhost}")

def main():
    """Main entry point for the script"""
    logger.info("Starting RabbitMQ message initializer")

    # Wait for RabbitMQ to be available
    if not wait_for_rabbitmq():
        logger.error("Failed to connect to RabbitMQ")
        return

    # Make sure all vhosts exist
    logger.info("Ensuring all virtual hosts exist...")
    ensure_vhosts_exist()

    # Wait a bit after creating vhosts to ensure they're fully available
    time.sleep(3)

    # Initialize each vhost with test messages
    initialization_errors = False
    for vhost in VHOSTS:
        try:
            logger.info(f"Starting initialization of vhost: {vhost}")
            initialize_vhost(vhost)
            logger.info(f"Successfully initialized vhost: {vhost}")
        except Exception as e:
            logger.error(f"Error initializing vhost {vhost}: {e}")
            initialization_errors = True

    if initialization_errors:
        logger.warning("Message initialization completed with some errors. Check the logs for details.")
    else:
        logger.info("Message initialization completed successfully!")

    # Always return success to allow container to exit cleanly
    print("Message initialization completed successfully!")

if __name__ == "__main__":
    main()