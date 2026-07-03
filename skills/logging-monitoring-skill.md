# Logging & Monitoring Skill — Structured Log + Error Tracking

Dùng khi setup logging mới, review log hiện tại, hoặc debug production incident. Log tốt = tìm bug nhanh. Log kém = mò trong bóng tối.

---

## 1. Triết lý logging

- **Log để debug, không log để biết app đang chạy.** `console.log('server started')` — ổn. `console.log('inside getUser')` — không ổn.
- **Log "tại sao" và "context", không log "đang làm gì".** Code đã nói đang làm gì — log cần nói tại sao nó bất thường.
- **Structured log** (JSON) thay vì plain text — máy đọc được, filter được, search được.
- **Không log sensitive data**: password, token, credit card, PII (họ tên, CMND, số điện thoại đầy đủ).
- **Log đủ để reproduce bug mà không cần hỏi thêm user.**

---

## 2. Log level — dùng đúng level

```
ERROR   → lỗi cần xử lý ngay, ảnh hưởng user. Luôn kèm stack trace.
WARN    → bất thường nhưng app vẫn chạy. Cần theo dõi.
INFO    → event quan trọng trong business flow (tạo order, user đăng ký).
DEBUG   → detail để debug, chỉ bật ở dev/staging.
```

**Mapping thực tế:**

```
ERROR: unhandled exception, DB connection fail, third-party API fail liên tục
WARN:  retry lần 2, fallback được kích hoạt, request chậm hơn threshold
INFO:  user login, order created, payment processed, file uploaded
DEBUG: query params, response shape, function input/output khi debug
```

**Không dùng `console.log` trực tiếp trong production code** — không có level, không có format, không filter được.

---

## 3. Structured logger — setup

**BE (Node.js) dùng `pino`:**

```ts
// src/lib/logger.ts
import pino from "pino";
import { env } from "@/config/env";

export const logger = pino({
  level: env.LOG_LEVEL ?? "info",
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard" },
    },
  }),
});
```

**Log với context:**

```ts
// Tốt — có context đủ để debug
logger.info({ userId, orderId, status }, "Order status updated");
logger.error({ err, userId, orderId }, "Failed to process payment");

// Kém — không có context
logger.info("Order updated");
logger.error("Payment failed");
```

**Child logger cho request context:**

```ts
// Middleware
app.use((req, res, next) => {
  req.log = logger.child({
    requestId: req.headers["x-request-id"] ?? cuid(),
    userId: req.user?.id,
    method: req.method,
    path: req.path,
  });
  next();
});

// Trong controller/service
req.log.info({ orderId }, "Creating order");
req.log.error({ err }, "Order creation failed");
```

---

## 4. Correlation ID — trace request xuyên suốt

```ts
// Mỗi request có 1 ID duy nhất
const requestId = req.headers["x-request-id"] ?? req.headers["x-correlation-id"] ?? cuid();

// Pass vào mọi log trong request lifecycle
// Pass vào header khi gọi external service
outgoingRequest.headers["x-request-id"] = requestId;

// Return về client để dễ lookup khi user báo bug
res.setHeader("x-request-id", requestId);
```

Khi user báo bug: hỏi lấy `x-request-id` từ response header → search log theo ID đó → thấy toàn bộ luồng.

---

## 5. Error logging — log đúng và đủ

```ts
// Luôn log full error object — pino tự extract stack trace từ `err`
logger.error({ err, context: { userId, action: "payment" } }, "Payment processing failed");

// Phân biệt expected error vs unexpected error
try {
  await processPayment(order);
} catch (err) {
  if (err instanceof PaymentDeclinedError) {
    // Expected — WARN, không cần alert
    logger.warn({ err, orderId }, "Payment declined by gateway");
    throw err;
  }
  // Unexpected — ERROR, cần alert
  logger.error({ err, orderId }, "Unexpected payment error");
  throw err;
}
```

**Không log và re-throw ở nhiều tầng** — log 1 lần ở nơi xử lý cuối cùng:

```ts
// ❌ Log ở service rồi lại log ở controller
// service
logger.error(err);
throw err;
// controller
logger.error(err); // duplicate log

// ✅ Chỉ log ở error handler tầng trên cùng
// Global error handler
app.use((err, req, res, next) => {
  req.log.error({ err }, "Unhandled request error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR" } });
});
```

---

## 6. Performance monitoring — phát hiện chậm

**Log slow request:**

```ts
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = duration > 3000 ? "warn" : "info";
    req.log[level]({ duration, status: res.statusCode }, "Request completed");
  });
  next();
});
```

**Log slow DB query (Prisma):**

```ts
const prisma = new PrismaClient({
  log: [
    { level: "warn", emit: "event" },
    { level: "error", emit: "event" },
  ],
});

prisma.$on("warn", (e) => logger.warn({ query: e.message }, "Prisma warning"));
prisma.$on("error", (e) => logger.error({ query: e.message }, "Prisma error"));

// Log query chậm hơn 1s
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    logger.warn({ model: params.model, action: params.action, duration }, "Slow DB query");
  }
  return result;
});
```

---

## 7. FE — error tracking

**Setup error boundary:**

```tsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Gửi lên error tracking service
    captureException(error, { extra: info });
  }
  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
```

**Unhandled promise rejection:**

```ts
window.addEventListener("unhandledrejection", (event) => {
  captureException(event.reason);
});
```

**Sentry (hoặc tương đương) — setup cơ bản:**

```ts
Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  beforeSend(event) {
    // Xoá sensitive data trước khi gửi
    if (event.user) delete event.user.email;
    return event;
  },
});
```

---

## 8. Alert — biết ngay khi có vấn đề

**Những gì cần alert ngay:**

- Error rate > 1% trong 5 phút.
- Response time P95 > 3 giây.
- DB connection pool exhausted.
- Failed payment liên tiếp.
- Memory/CPU spike bất thường.

**Những gì không cần alert (noise):**

- 404 (user gõ sai URL — bình thường).
- 401 (session hết hạn — bình thường).
- Known flaky external service (có retry logic rồi).

---

## 9. Checklist logging review

1. Có `console.log` nào còn sót trong production code không?
2. Log có structured (JSON object) không, hay plain string?
3. Log có sensitive data (token, password, PII) không?
4. Mọi request có correlation ID không?
5. Error có log full stack trace không?
6. Có log duplicate ở nhiều tầng không?
7. Slow request/query có được log không?
8. FE có error boundary + unhandled rejection handler không?
9. Alert có bao phủ error rate và latency không?
10. Log level có phù hợp với từng loại event không?
