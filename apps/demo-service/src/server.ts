import { metrics, SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import Fastify from "fastify";
import { appLogger } from "./instrumentation.js";

type CheckoutMode = "healthy" | "slow" | "failed";
type CheckoutBody = { mode: CheckoutMode; amount: number };

const app = Fastify({ logger: false });
const tracer = trace.getTracer("checkout-domain", "0.1.0");
const meter = metrics.getMeter("checkout-domain", "0.1.0");
const checkoutCounter = meter.createCounter("checkout.requests", { description: "Checkout attempts" });
const checkoutDuration = meter.createHistogram("checkout.duration", { unit: "ms", description: "End-to-end checkout duration" });

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function inSpan<T>(name: string, attributes: Attributes, work: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work();
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      span.end();
    }
  });
}

app.get("/health", async () => ({ ok: true, service: "checkout-api" }));

app.get("/api/catalog", async () => {
  trace.getActiveSpan()?.updateName("GET /api/catalog");
  return inSpan("catalog lookup", { "cache.hit": true }, async () => {
    await delay(28);
    appLogger.emit({ severityNumber: SeverityNumber.INFO, severityText: "INFO", body: "Catalog response served from cache", attributes: { "cache.result": "hit" } });
    return { products: [{ id: "observability-handbook", price: 12900 }] };
  });
});

app.post<{ Body: CheckoutBody }>("/api/checkout", {
  schema: {
    body: {
      type: "object",
      required: ["mode", "amount"],
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["healthy", "slow", "failed"] },
        amount: { type: "integer", minimum: 100, maximum: 1_000_000 },
      },
    },
  },
}, async (request, reply) => {
  const started = performance.now();
  const { mode, amount } = request.body;
  const activeSpan = trace.getActiveSpan();
  activeSpan?.updateName("POST /api/checkout");
  activeSpan?.setAttributes({
    "checkout.mode": mode,
    "checkout.amount": amount,
    "checkout.currency": "EUR",
  });
  checkoutCounter.add(1, { mode });

  try {
    await inSpan("validate cart", { "cart.items": 3 }, async () => delay(24));
    await inSpan("reserve inventory", { "db.system": "postgresql" }, async () => delay(58));
    await inSpan("charge payment", { "payment.provider": "demo-pay", "retry.attempt": mode === "failed" ? 2 : 1 }, async () => {
      await delay(mode === "healthy" ? 92 : mode === "slow" ? 760 : 910);
      if (mode === "failed") throw new Error("Payment provider returned an ambiguous timeout");
    });
    await inSpan("commit order", { "db.system": "postgresql" }, async () => delay(42));

    const duration = performance.now() - started;
    checkoutDuration.record(duration, { mode, outcome: "completed" });
    appLogger.emit({
      severityNumber: SeverityNumber.INFO,
      severityText: "INFO",
      body: "Checkout completed",
      attributes: { "checkout.amount": amount, "checkout.currency": "EUR", "checkout.mode": mode },
    });
    return reply.code(201).send({ id: crypto.randomUUID(), state: "completed", durationMs: Math.round(duration) });
  } catch (error) {
    const duration = performance.now() - started;
    activeSpan?.setStatus({ code: SpanStatusCode.ERROR, message: "Payment requires reconciliation" });
    activeSpan?.recordException(error instanceof Error ? error : new Error(String(error)));
    checkoutDuration.record(duration, { mode, outcome: "reconciliation" });
    appLogger.emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: "ERROR",
      body: "Provider timed out after the charge request was accepted",
      attributes: { "payment.outcome": "unknown", "retry.policy": "reconcile", "checkout.mode": mode },
    });
    await inSpan("release inventory", { "compensation.reason": "payment_failed" }, async () => delay(39));
    appLogger.emit({
      severityNumber: SeverityNumber.WARN,
      severityText: "WARN",
      body: "Checkout moved to payment_reconciliation instead of blind retry",
      attributes: { "checkout.state": "payment_reconciliation" },
    });
    return reply.code(502).send({ state: "payment_reconciliation", retry: false, durationMs: Math.round(duration) });
  }
});

try {
  await app.listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" });
  console.log("Instrumented demo service listening on http://localhost:4000");
} catch (error) {
  console.error(error);
  process.exit(1);
}
