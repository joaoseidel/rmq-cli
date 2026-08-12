import { describe, expect, it } from "vitest";
import type { Message } from "../src/core/domain/message.ts";
import { messageId } from "../src/core/domain/message-id.ts";
import {
  compileQuery,
  parseQuery,
  queryHighlight,
  stripJsonWhitespace,
  valuesAtPath,
  type Query,
} from "../src/core/usecase/message-query.ts";

function message(
  payload: string,
  extra: Partial<Pick<Message, "headers" | "properties" | "routingKey" | "exchange">> = {},
): Message {
  return {
    transport: "amqp",
    id: messageId("amqp:1:orders"),
    exchange: extra.exchange ?? "amq.default",
    routingKey: extra.routingKey ?? "orders",
    payload,
    headers: extra.headers ?? {},
    properties: extra.properties ?? {},
  };
}

function matches(term: string, target: Message): boolean {
  const parsed = parseQuery(term);
  if (parsed.kind === "invalid") {
    throw new Error(`expected a valid query, got: ${parsed.reason}`);
  }
  return compileQuery(parsed)(target);
}

describe("parsing a query", () => {
  it("treats a JSON fragment as a literal instead of a regex", () => {
    const parsed = parseQuery('{"status":"failed"}');
    expect(parsed.kind).toBe("literal");
  });

  it("reads a dotted path with a value as a path query", () => {
    const parsed = parseQuery("order.items.sku:AB-991") as Query;
    expect(parsed.kind).toBe("path");
    expect(parsed.kind === "path" ? parsed.path : []).toEqual([
      "order",
      "items",
      "sku",
    ]);
  });

  it("reads an explicit regex query", () => {
    const parsed = parseQuery("re:AB-\\d{3}") as Query;
    expect(parsed.kind).toBe("regex");
  });

  it("reports an invalid regex rather than matching nothing", () => {
    const parsed = parseQuery("re:AB-(");
    expect(parsed.kind).toBe("invalid");
    expect(parsed.kind === "invalid" ? parsed.reason : "").toContain(
      "Invalid regular expression",
    );
  });

  it("reports an empty query", () => {
    expect(parseQuery("   ").kind).toBe("invalid");
  });

  it("does not mistake a url for a path query", () => {
    expect(parseQuery("https://example.com/orders").kind).toBe("literal");
  });

  it("offers the literal needle for highlighting and nothing for a regex", () => {
    expect(queryHighlight(parseQuery("AB-991") as Query)).toBe("AB-991");
    expect(queryHighlight(parseQuery("re:AB") as Query)).toBe("");
  });
});

describe("literal matching", () => {
  it("finds a nested JSON fragment that the old glob matcher dropped", () => {
    expect(matches('{"status":"failed"}', message('{"id":7,"status":"failed"}'))).toBe(
      true,
    );
  });

  it("finds a term containing regex alternation", () => {
    expect(matches("a|b", message('{"code":"a|b"}'))).toBe(true);
    expect(matches("a|b", message('{"code":"a"}'))).toBe(false);
  });

  it("finds a term containing a quantifier character", () => {
    expect(matches("price+tax", message("total price+tax = 9"))).toBe(true);
  });

  it("ignores whitespace differences inside JSON", () => {
    const target = message('{\n  "status": "failed",\n  "retries": 3\n}');
    expect(matches('{"status":"failed"}', target)).toBe(true);
    expect(matches('"retries": 3', target)).toBe(true);
  });

  it("keeps whitespace that lives inside a string", () => {
    expect(matches("order failed", message('{"note":"order failed"}'))).toBe(true);
    expect(matches("orderfailed", message('{"note":"order failed"}'))).toBe(false);
  });

  it("matches a JSON fragment nested at any depth", () => {
    const target = message(
      '{"order":{"items":[{"sku":"AB-991","qty":2}],"total":10}}',
    );
    expect(matches('{"sku":"AB-991"}', target)).toBe(true);
    expect(matches('{"sku":"AB-991","qty":2}', target)).toBe(true);
    expect(matches('{"sku":"AB-991","qty":9}', target)).toBe(false);
  });

  it("is case insensitive", () => {
    expect(matches("ab-991", message('{"sku":"AB-991"}'))).toBe(true);
  });

  it("searches header keys as well as header values", () => {
    const target = message("{}", { headers: { "x-retry-count": "4" } });
    expect(matches("x-retry-count", target)).toBe(true);
    expect(matches("4", target)).toBe(true);
  });

  it("searches routing key and exchange", () => {
    const target = message("{}", { routingKey: "orders.retry", exchange: "events" });
    expect(matches("orders.retry", target)).toBe(true);
    expect(matches("events", target)).toBe(true);
  });
});

describe("path matching", () => {
  const target = message(
    '{"order":{"id":42,"items":[{"sku":"AB-991","qty":2},{"sku":"ZZ-100","qty":1}]}}',
  );

  it("walks a nested object path", () => {
    expect(matches("order.id:42", target)).toBe(true);
    expect(matches("order.id:43", target)).toBe(false);
  });

  it("walks into arrays implicitly", () => {
    expect(matches("order.items.sku:AB-991", target)).toBe(true);
  });

  it("walks into arrays with an explicit wildcard", () => {
    expect(matches("order.items.*.sku:AB-991", target)).toBe(true);
  });

  it("walks into arrays by index", () => {
    expect(matches("order.items.1.sku:ZZ-100", target)).toBe(true);
    expect(matches("order.items.0.sku:ZZ-100", target)).toBe(false);
  });

  it("does not match a path that is absent", () => {
    expect(matches("order.customer.name:ana", target)).toBe(false);
  });

  it("matches a header by its full name", () => {
    const withHeader = message("not json", { headers: { "x-origin": "checkout" } });
    expect(matches("x-origin:checkout", withHeader)).toBe(true);
  });

  it("falls back to a literal match when the payload is not JSON", () => {
    expect(matches("status:failed", message("status:failed at 10:31"))).toBe(true);
  });

  it("stringifies an object leaf so a subtree can be matched", () => {
    expect(matches("order.items:ZZ-100", target)).toBe(true);
  });
});

describe("regex matching", () => {
  it("matches an explicit pattern", () => {
    expect(matches("re:AB-\\d{3}", message('{"sku":"AB-991"}'))).toBe(true);
    expect(matches("re:AB-\\d{4}", message('{"sku":"AB-991"}'))).toBe(false);
  });
});

describe("helpers", () => {
  it("strips whitespace outside strings only", () => {
    expect(stripJsonWhitespace('{ "a": "x y" }')).toBe('{"a":"x y"}');
  });

  it("keeps an escaped quote inside a string", () => {
    expect(stripJsonWhitespace('{ "a": "x \\" y" }')).toBe('{"a":"x \\" y"}');
  });

  it("collects every value reached by a path", () => {
    const root = { items: [{ sku: "a" }, { sku: "b" }] };
    expect(valuesAtPath(root, ["items", "sku"])).toEqual(["a", "b"]);
    expect(valuesAtPath(root, ["missing"])).toEqual([]);
  });
});
