#!/usr/bin/env python3
"""
RabbitMQ Message Initializer

Seeds a RabbitMQ instance with realistic e-commerce messages for development
and demonstration of rmq-cli.
"""

import json
import time
import logging
import random
import uuid
from datetime import datetime, timedelta, timezone

import pika
from pika import BasicProperties

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("seed")

HOST = "rabbitmq"
PORT = 5672
USER = "rabbitmq"
PASS = "rabbitmq"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def connect(vhost="/"):
    creds = pika.PlainCredentials(USER, PASS)
    params = pika.ConnectionParameters(
        host=HOST,
        port=PORT,
        virtual_host=vhost,
        credentials=creds,
        heartbeat=600,
        connection_attempts=5,
        retry_delay=5,
    )
    conn = pika.BlockingConnection(params)
    return conn, conn.channel()


def wait_for_rabbit():
    for i in range(30):
        try:
            c, _ = connect()
            c.close()
            log.info("RabbitMQ is ready")
            return True
        except Exception:
            log.info("Waiting for RabbitMQ... (%d/30)", i + 1)
            time.sleep(3)
    log.error("RabbitMQ did not become ready")
    return False


def iso(dt):
    return dt.isoformat()


NOW = datetime.now(timezone.utc)


def ts(dt):
    return int(dt.timestamp())


def uid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Payload factories
# ---------------------------------------------------------------------------

CUSTOMERS = [
    {"id": "CUST-1001", "name": "Acme Corp", "email": "orders@acme.example"},
    {"id": "CUST-1002", "name": "Globex", "email": "buy@globex.example"},
    {"id": "CUST-1003", "name": "Initech", "email": "procurement@initech.example"},
    {"id": "CUST-1004", "name": "Umbrella Inc", "email": "supply@umbrella.example"},
    {"id": "CUST-1005", "name": "Wayne Enterprises", "email": "ops@wayne.example"},
]

PRODUCTS = [
    {"sku": "WIDGET-A1", "name": "Widget A", "price": 29.99},
    {"sku": "GADGET-B2", "name": "Gadget B", "price": 49.99},
    {"sku": "DOODAD-C3", "name": "Doodad C", "price": 14.50},
    {"sku": "THINGY-D4", "name": "Thingy D", "price": 99.00},
    {"sku": "WHATSIT-E5", "name": "Whatsit E", "price": 7.25},
]


def random_customer():
    return random.choice(CUSTOMERS)


def random_items(n=None):
    if n is None:
        n = random.randint(1, 4)
    items = []
    for _ in range(n):
        p = random.choice(PRODUCTS)
        qty = random.randint(1, 10)
        items.append({
            "sku": p["sku"],
            "name": p["name"],
            "quantity": qty,
            "unit_price": p["price"],
            "line_total": round(p["price"] * qty, 2),
        })
    return items


def order_id():
    return f"ORD-{random.randint(10000, 99999)}"


def payment_id():
    return f"PAY-{random.randint(10000, 99999)}"


def tracking_id():
    return f"TRK-{random.randint(100000, 999999)}"


# ---------------------------------------------------------------------------
# Order messages
# ---------------------------------------------------------------------------

def new_order_event():
    oid = order_id()
    cust = random_customer()
    items = random_items()
    total = sum(i["line_total"] for i in items)
    return {
        "event": "order.created",
        "order_id": oid,
        "customer": cust,
        "items": items,
        "total": round(total, 2),
        "currency": "USD",
        "created_at": iso(NOW),
    }


def order_processing_event():
    oid = order_id()
    return {
        "event": "order.processing",
        "order_id": oid,
        "started_at": iso(NOW),
        "assigned_worker": f"worker-{random.randint(1, 8)}",
    }


def order_completed_event():
    oid = order_id()
    return {
        "event": "order.completed",
        "order_id": oid,
        "completed_at": iso(NOW),
        "items_shipped": random.randint(1, 5),
    }


# ---------------------------------------------------------------------------
# Payment messages
# ---------------------------------------------------------------------------

def payment_process_event():
    pid = payment_id()
    oid = order_id()
    return {
        "event": "payment.process",
        "payment_id": pid,
        "order_id": oid,
        "amount": round(random.uniform(15.0, 500.0), 2),
        "currency": "USD",
        "method": random.choice(["credit_card", "debit_card", "paypal", "wire_transfer"]),
        "initiated_at": iso(NOW),
    }


def payment_completed_event():
    pid = payment_id()
    return {
        "event": "payment.completed",
        "payment_id": pid,
        "authorized_at": iso(NOW),
        "auth_code": f"AUTH-{random.randint(1000, 9999)}",
    }


# ---------------------------------------------------------------------------
# Shipping messages
# ---------------------------------------------------------------------------

def shipping_dispatch_event():
    oid = order_id()
    tid = tracking_id()
    return {
        "event": "shipping.dispatch",
        "order_id": oid,
        "tracking_id": tid,
        "carrier": random.choice(["FedEx", "UPS", "DHL", "USPS"]),
        "service": random.choice(["standard", "express", "overnight"]),
        "estimated_delivery": iso(NOW + timedelta(days=random.randint(1, 7))),
        "dispatched_at": iso(NOW),
    }


def shipping_delivered_event():
    tid = tracking_id()
    return {
        "event": "shipping.delivered",
        "tracking_id": tid,
        "delivered_at": iso(NOW),
        "signed_by": random.choice(["J. Smith", "front desk", "neighbor", "left at door"]),
    }


# ---------------------------------------------------------------------------
# Notification messages
# ---------------------------------------------------------------------------

def email_notification():
    return {
        "channel": "email",
        "to": random_customer()["email"],
        "subject": random.choice([
            "Order confirmed",
            "Payment received",
            "Your order has shipped",
            "Delivery complete",
            "Password reset request",
        ]),
        "from": "noreply@shop.example",
        "body_preview": "This is a transactional email notification...",
        "template_id": random.choice(["order-confirmation", "shipping-update", "payment-receipt"]),
        "sent_at": iso(NOW),
    }


def push_notification():
    return {
        "channel": "push",
        "device_token": uid(),
        "title": random.choice([
            "Order update",
            "Payment processed",
            "Shipment on the way",
            "Delivered!",
        ]),
        "body": "Tap to view details",
        "badge": random.randint(1, 10),
        "sent_at": iso(NOW),
    }


def sms_notification():
    return {
        "channel": "sms",
        "phone": f"+1555{random.randint(1000000, 9999999)}",
        "message": random.choice([
            "Your order has been confirmed.",
            "Payment of ${:.2f} processed.".format(random.uniform(10, 300)),
            "Your package is out for delivery.",
            "Delivered. Track: {}".format(tracking_id()),
        ]),
        "sent_at": iso(NOW),
    }


# ---------------------------------------------------------------------------
# Inventory messages
# ---------------------------------------------------------------------------

def inventory_update_event():
    return {
        "event": "inventory.updated",
        "sku": random.choice(PRODUCTS)["sku"],
        "warehouse": random.choice(["WH-EAST", "WH-WEST", "WH-EU"]),
        "previous_qty": random.randint(0, 200),
        "new_qty": random.randint(0, 200),
        "reason": random.choice(["restock", "adjustment", "return", "cycle_count"]),
        "updated_at": iso(NOW),
    }


def inventory_reserve_event():
    oid = order_id()
    return {
        "event": "inventory.reserve",
        "order_id": oid,
        "items": [{"sku": p["sku"], "qty": random.randint(1, 5)} for p in random.sample(PRODUCTS, random.randint(1, 3))],
        "expires_at": iso(NOW + timedelta(minutes=15)),
        "reserved_at": iso(NOW),
    }


# ---------------------------------------------------------------------------
# User / analytics
# ---------------------------------------------------------------------------

def user_event():
    return {
        "event": random.choice(["user.registered", "user.logged_in", "user.updated_profile", "user.password_changed"]),
        "user_id": f"USR-{random.randint(1000, 9999)}",
        "email": random_customer()["email"],
        "ip": f"{random.randint(10, 192)}.{random.randint(0, 255)}.{random.randint(0, 255)}.{random.randint(1, 254)}",
        "user_agent": "Mozilla/5.0",
        "timestamp": iso(NOW),
    }


def analytics_event():
    return {
        "event_type": random.choice(["page_view", "add_to_cart", "checkout_start", "search", "product_click"]),
        "session_id": uid(),
        "user_id": f"USR-{random.randint(1000, 9999)}",
        "page": random.choice(["/", "/products", "/cart", "/checkout", "/account"]),
        "referrer": random.choice(["google", "direct", "email", "social", None]),
        "timestamp": iso(NOW),
    }


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------

def audit_event():
    return {
        "action": random.choice([
            "order.status_changed",
            "payment.refund_initiated",
            "inventory.low_stock_warning",
            "user.role_updated",
            "admin.queue_purged",
        ]),
        "actor": f"USR-{random.randint(1000, 9999)}",
        "details": {"ip": f"10.0.{random.randint(0, 255)}.{random.randint(1, 254)}"},
        "severity": random.choice(["info", "warn", "error"]),
        "timestamp": iso(NOW),
    }


# ---------------------------------------------------------------------------
# Dead-letter messages (failed orders / payments / shipping)
# ---------------------------------------------------------------------------

def failed_order():
    return {
        "event": "order.failed",
        "order_id": order_id(),
        "error": random.choice([
            "inventory_unavailable",
            "payment_timeout",
            "address_validation_failed",
            "customer_blocked",
        ]),
        "retry_count": random.randint(1, 3),
        "failed_at": iso(NOW),
    }


def failed_payment():
    return {
        "event": "payment.failed",
        "payment_id": payment_id(),
        "order_id": order_id(),
        "error": random.choice([
            "card_declined",
            "insufficient_funds",
            "expired_card",
            "gateway_timeout",
            "fraud_suspected",
        ]),
        "amount": round(random.uniform(10, 500), 2),
        "failed_at": iso(NOW),
    }


def failed_shipping():
    return {
        "event": "shipping.failed",
        "order_id": order_id(),
        "tracking_id": tracking_id(),
        "error": random.choice([
            "address_undeliverable",
            "carrier_timeout",
            "package_damaged",
            "customs_hold",
        ]),
        "failed_at": iso(NOW),
    }


def expired_reservation():
    return {
        "event": "inventory.expired",
        "order_id": order_id(),
        "items": [{"sku": p["sku"], "qty": random.randint(1, 3)} for p in random.sample(PRODUCTS, 2)],
        "expired_at": iso(NOW),
    }


# ---------------------------------------------------------------------------
# Infrastructure declarations
# ---------------------------------------------------------------------------

EXCHANGES = [
    ("exchange.orders", "topic"),
    ("exchange.payments", "topic"),
    ("exchange.shipping", "topic"),
    ("exchange.notifications", "topic"),
    ("exchange.inventory", "topic"),
    ("exchange.users", "fanout"),
    ("exchange.analytics", "fanout"),
    ("dlx.orders", "topic"),
    ("dlx.payments", "topic"),
    ("dlx.shipping", "topic"),
    ("dlx.inventory", "topic"),
]

DEAD_LETTER_QUEUES = [
    ("orders.failed", "dlx.orders", "orders.failed"),
    ("payments.failed", "dlx.payments", "payments.failed"),
    ("shipping.failed", "dlx.shipping", "shipping.failed"),
    ("inventory.expired", "dlx.inventory", "inventory.expired"),
]

# Queues with DLX arguments
DLX_QUEUES = [
    ("orders.new", "dlx.orders", "orders.failed"),
    ("orders.processing", "dlx.orders", "orders.failed"),
    ("payments.process", "dlx.payments", "payments.failed"),
    ("shipping.outbound", "dlx.shipping", "shipping.failed"),
    ("inventory.reservations", "dlx.inventory", "inventory.expired"),
]

PLAIN_QUEUES = [
    "orders.completed",
    "payments.completed",
    "shipping.completed",
    "notifications.email",
    "notifications.push",
    "notifications.sms",
    "inventory.updates",
    "audit.log",
    "analytics.events",
    "users.events",
]


def declare_infrastructure(ch, exchanges, dlx_queues, plain_queues, dead_letter_queues):
    for name, etype in exchanges:
        ch.exchange_declare(exchange=name, exchange_type=etype, durable=True)
    for name, dlx, rk in dlx_queues:
        ch.queue_declare(
            queue=name,
            durable=True,
            arguments={
                "x-dead-letter-exchange": dlx,
                "x-dead-letter-routing-key": rk,
            },
        )
    for name in plain_queues:
        ch.queue_declare(queue=name, durable=True)
    for name, dlx, rk in dead_letter_queues:
        ch.queue_declare(queue=name, durable=True)
        ch.queue_bind(queue=name, exchange=dlx, routing_key=rk)
    for name, etype in exchanges:
        # Bind queues that use direct publish (no routing through exchanges)
        pass


def declare_main_bindings(ch):
    bindings = [
        ("exchange.orders", "orders.new", "order.created"),
        ("exchange.orders", "orders.processing", "order.processing"),
        ("exchange.orders", "orders.completed", "order.completed"),
        ("exchange.payments", "payments.process", "payment.process"),
        ("exchange.payments", "payments.completed", "payment.completed"),
        ("exchange.shipping", "shipping.outbound", "shipping.dispatch"),
        ("exchange.shipping", "shipping.completed", "shipping.delivered"),
        ("exchange.notifications", "notifications.email", "notification.email"),
        ("exchange.notifications", "notifications.push", "notification.push"),
        ("exchange.notifications", "notifications.sms", "notification.sms"),
        ("exchange.inventory", "inventory.updates", "inventory.updated"),
        ("exchange.inventory", "inventory.reservations", "inventory.reserve"),
    ]
    for exchange, queue, routing_key in bindings:
        ch.queue_bind(queue=queue, exchange=exchange, routing_key=routing_key)
    # Fanout exchanges bind with empty routing key
    ch.queue_bind(queue="users.events", exchange="exchange.users", routing_key="")
    ch.queue_bind(queue="analytics.events", exchange="exchange.analytics", routing_key="")


def declare_staging_infrastructure(ch):
    ch.exchange_declare(exchange="staging.exchange", exchange_type="topic", durable=True)
    for q in ["staging.orders", "staging.payments", "staging.notifications"]:
        ch.queue_declare(queue=q, durable=True)
    ch.queue_bind(queue="staging.orders", exchange="staging.exchange", routing_key="order.#")
    ch.queue_bind(queue="staging.payments", exchange="staging.exchange", routing_key="payment.#")
    ch.queue_bind(queue="staging.notifications", exchange="staging.exchange", routing_key="notification.#")


# ---------------------------------------------------------------------------
# Seed logic
# ---------------------------------------------------------------------------

def seed_queue(ch, queue, payload, routing_key="", exchange="", props=None):
    body = json.dumps(payload).encode()
    ch.basic_publish(
        exchange=exchange,
        routing_key=routing_key or queue,
        body=body,
        properties=props or BasicProperties(
            content_type="application/json",
            delivery_mode=2,
            message_id=uid(),
            timestamp=ts(NOW),
            app_id="rmq-dev-seed",
        ),
    )


def seed_main_vhost(ch):
    # --- Orders ---
    for _ in range(8):
        seed_queue(ch, "orders.new", new_order_event(), "order.created", "exchange.orders")
    for _ in range(5):
        seed_queue(ch, "orders.processing", order_processing_event(), "order.processing", "exchange.orders")
    for _ in range(12):
        seed_queue(ch, "orders.completed", order_completed_event(), "order.completed", "exchange.orders")
    for _ in range(3):
        seed_queue(ch, "orders.failed", failed_order())

    # --- Payments ---
    for _ in range(6):
        seed_queue(ch, "payments.process", payment_process_event(), "payment.process", "exchange.payments")
    for _ in range(9):
        seed_queue(ch, "payments.completed", payment_completed_event(), "payment.completed", "exchange.payments")
    for _ in range(4):
        seed_queue(ch, "payments.failed", failed_payment())

    # --- Shipping ---
    for _ in range(4):
        seed_queue(ch, "shipping.outbound", shipping_dispatch_event(), "shipping.dispatch", "exchange.shipping")
    for _ in range(7):
        seed_queue(ch, "shipping.completed", shipping_delivered_event(), "shipping.delivered", "exchange.shipping")
    for _ in range(2):
        seed_queue(ch, "shipping.failed", failed_shipping())

    # --- Notifications ---
    for _ in range(10):
        seed_queue(ch, "notifications.email", email_notification(), "notification.email", "exchange.notifications")
    for _ in range(6):
        seed_queue(ch, "notifications.push", push_notification(), "notification.push", "exchange.notifications")
    for _ in range(3):
        seed_queue(ch, "notifications.sms", sms_notification(), "notification.sms", "exchange.notifications")

    # --- Inventory ---
    for _ in range(7):
        seed_queue(ch, "inventory.updates", inventory_update_event(), "inventory.updated", "exchange.inventory")
    for _ in range(4):
        seed_queue(ch, "inventory.reservations", inventory_reserve_event(), "inventory.reserve", "exchange.inventory")
    for _ in range(2):
        seed_queue(ch, "inventory.expired", expired_reservation())

    # --- Users ---
    for _ in range(5):
        seed_queue(ch, "users.events", user_event(), "", "exchange.users")

    # --- Analytics ---
    for _ in range(8):
        seed_queue(ch, "analytics.events", analytics_event(), "", "exchange.analytics")

    # --- Audit ---
    for _ in range(6):
        seed_queue(ch, "audit.log", audit_event())


def seed_staging_vhost(ch):
    for _ in range(3):
        seed_queue(ch, "staging.orders", new_order_event(), "order.created", "staging.exchange")
    for _ in range(2):
        seed_queue(ch, "staging.payments", payment_process_event(), "payment.process", "staging.exchange")
    for _ in range(2):
        seed_queue(ch, "staging.notifications", email_notification(), "notification.email", "staging.exchange")


def main():
    log.info("Starting RabbitMQ seed")
    if not wait_for_rabbit():
        return

    # Default vhost
    log.info("Seeding / vhost")
    conn, ch = connect("/")
    try:
        declare_infrastructure(ch, EXCHANGES, DLX_QUEUES, PLAIN_QUEUES, DEAD_LETTER_QUEUES)
        declare_main_bindings(ch)
        seed_main_vhost(ch)
    finally:
        conn.close()

    log.info("Seed complete")


if __name__ == "__main__":
    main()
