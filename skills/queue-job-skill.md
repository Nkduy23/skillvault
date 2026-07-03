# Queue & Background Job Skill — BullMQ + Retry Strategy

Dùng khi có task không cần thực hiện ngay trong request cycle: gửi email, xử lý ảnh, export file, push notification, sync data. Queue sai = mất job, xử lý 2 lần, hoặc retry vô tận.

---

## 1. Khi nào dùng queue

**Dùng queue khi:**

- Task mất > 500ms — người dùng không cần đợi.
- Task có thể fail và cần retry: gửi email, gọi external API.
- Task cần chạy sau 1 thời gian: nhắc nhở, schedule report.
- Task nặng cần rate limit: resize ảnh, generate PDF, send bulk email.
- Task cần đảm bảo "exactly-once" hoặc "at-least-once" delivery.

**Không dùng queue khi:**

- Task < 100ms và không thể fail: tính tổng, format string.
- User cần kết quả ngay lập tức: check inventory trước khi confirm order.
- Task đơn giản có thể xử lý inline với error handling tốt.

---

## 2. BullMQ setup — cơ bản

**Cấu trúc thư mục:**

```
src/
  queues/
    index.ts              ← export tất cả queue
    email.queue.ts        ← queue definition
    email.worker.ts       ← worker processor
    email.types.ts        ← job data types
```

**Queue definition:**

```ts
// queues/email.queue.ts
import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const emailQueue = new Queue("email", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 }, // 2s, 4s, 8s
    removeOnComplete: { count: 1000 }, // giữ 1000 completed job để debug
    removeOnFail: { count: 5000 }, // giữ 5000 failed job để phân tích
  },
});
```

**Job data types — type safe:**

```ts
// queues/email.types.ts
export interface WelcomeEmailJob {
  type: "WELCOME";
  userId: string;
  email: string;
  name: string;
}

export interface OrderConfirmEmailJob {
  type: "ORDER_CONFIRM";
  orderId: string;
  userEmail: string;
}

export type EmailJobData = WelcomeEmailJob | OrderConfirmEmailJob;
```

**Worker:**

```ts
// queues/email.worker.ts
import { Worker, Job } from "bullmq";
import { EmailJobData } from "./email.types";

export const emailWorker = new Worker<EmailJobData>(
  "email",
  async (job: Job<EmailJobData>) => {
    logger.info({ jobId: job.id, type: job.data.type }, "Processing email job");

    switch (job.data.type) {
      case "WELCOME":
        await sendWelcomeEmail(job.data);
        break;
      case "ORDER_CONFIRM":
        await sendOrderConfirmEmail(job.data);
        break;
      default:
        throw new Error(`Unknown job type: ${(job.data as any).type}`);
    }
  },
  {
    connection: redis,
    concurrency: 5, // xử lý tối đa 5 job song song
  },
);

emailWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Email job completed");
});

emailWorker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err }, "Email job failed");
});
```

**Add job từ service:**

```ts
// Trong service sau khi tạo user
await emailQueue.add(
  "welcome", // job name
  {
    type: "WELCOME",
    userId: user.id,
    email: user.email,
    name: user.name,
  },
  {
    delay: 0, // chạy ngay
    priority: 1, // ưu tiên cao hơn
    jobId: `welcome-${user.id}`, // idempotent — không add job trùng
  },
);
```

---

## 3. Retry strategy — thiết kế đúng

**Exponential backoff:**

```ts
backoff: {
  type: 'exponential',
  delay: 1000,  // delay ban đầu
}
// Attempts: 1s → 2s → 4s → 8s → 16s...
```

**Fixed delay:**

```ts
backoff: { type: 'fixed', delay: 5000 } // retry sau 5s mỗi lần
```

**Phân biệt lỗi retryable vs không retryable:**

```ts
async function processor(job: Job) {
  try {
    await sendEmail(job.data);
  } catch (err) {
    // Lỗi tạm thời → retry
    if (err instanceof NetworkError || err instanceof RateLimitError) {
      throw err; // BullMQ sẽ retry
    }
    // Lỗi vĩnh viễn → không retry, move to failed
    if (err instanceof InvalidEmailError) {
      await job.moveToFailed(err, job.token!, true); // discard = true
      return;
    }
    throw err;
  }
}
```

**Dead letter queue — xử lý job failed hết attempt:**

```ts
emailQueue.on("failed", async (job, err) => {
  if (job && job.attemptsMade >= job.opts.attempts!) {
    // Job đã retry đủ số lần → alert, manual review
    await deadLetterQueue.add("failed-email", {
      originalJob: job.data,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    logger.error({ jobId: job.id, data: job.data }, "Job moved to dead letter queue");
  }
});
```

---

## 4. Idempotency — xử lý đúng 1 lần

Job có thể bị retry → processor phải idempotent (chạy nhiều lần = kết quả như chạy 1 lần).

```ts
async function sendWelcomeEmail(data: WelcomeEmailJob) {
  // Check xem đã gửi chưa — tránh gửi 2 lần
  const alreadySent = await emailLogRepo.exists({
    userId: data.userId,
    type: "WELCOME",
  });
  if (alreadySent) {
    logger.info({ userId: data.userId }, "Welcome email already sent, skipping");
    return;
  }

  await mailer.send({ to: data.email, template: "welcome", data });

  // Ghi log sau khi gửi thành công
  await emailLogRepo.create({ userId: data.userId, type: "WELCOME", sentAt: new Date() });
}
```

**Unique job ID để tránh duplicate enqueue:**

```ts
await emailQueue.add("welcome", data, {
  jobId: `welcome-user-${userId}`, // BullMQ không add nếu jobId đã tồn tại trong queue
});
```

---

## 5. Scheduled job (cron)

```ts
// Chạy report mỗi ngày 8 giờ sáng
await reportQueue.add(
  "daily-revenue-report",
  { date: new Date().toISOString() },
  {
    repeat: { pattern: "0 8 * * *", tz: "Asia/Ho_Chi_Minh" },
    jobId: "daily-revenue-report", // đảm bảo không tạo duplicate schedule
  },
);

// Reminder sau 3 ngày
await reminderQueue.add(
  "abandoned-cart",
  { cartId, userId },
  {
    delay: 3 * 24 * 60 * 60 * 1000, // 3 ngày
    jobId: `abandoned-cart-${cartId}`, // idempotent
  },
);
```

---

## 6. Monitoring queue

**Health check endpoint:**

```ts
app.get("/health/queues", async (req, res) => {
  const [waiting, active, failed] = await Promise.all([emailQueue.getWaitingCount(), emailQueue.getActiveCount(), emailQueue.getFailedCount()]);
  res.json({ waiting, active, failed });
});
```

**Alert khi:**

- Queue depth tăng liên tục (worker không xử lý kịp).
- Failed job count tăng đột biến.
- Job age (thời gian chờ trong queue) > threshold.

---

## 7. Checklist queue review

1. Job data type có được define rõ ràng không?
2. Retry strategy có phù hợp với từng loại job không?
3. Processor có idempotent không? (chạy nhiều lần = kết quả 1 lần)
4. Có unique jobId để tránh duplicate enqueue không?
5. Lỗi không retryable có được discard (không retry vô tận) không?
6. Job failed hết attempt có vào dead letter queue và alert không?
7. Worker có error logging đủ context (jobId, data) không?
8. Scheduled job có unique ID để không tạo duplicate schedule không?
9. Queue có health check monitoring không?
10. Worker concurrency có được set hợp lý không?
