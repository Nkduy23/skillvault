# Error Design Skill — Custom Error, Error Code, FE Error UI

Dùng khi thiết kế error system mới hoặc review error handling hiện tại. Error design tốt = debug nhanh, UX tốt, FE-BE không cần hỏi nhau khi có lỗi.

---

## 1. Triết lý error design

- **Error là first-class citizen** — thiết kế error system cùng lúc với happy path, không phải sau.
- **Error code là contract** giữa FE và BE — string constant, không phải message text.
- **Phân biệt 4 loại lỗi:**
  ```
  Validation error  → user input sai (400) — show cho user
  Business error    → rule nghiệp vụ vi phạm (409, 422) — show cho user
  Auth error        → chưa login / không có quyền (401, 403) — redirect
  System error      → unexpected (500) — show generic message, log chi tiết
  ```
- **User thấy message thân thiện. Dev thấy detail đầy đủ.** Không bao giờ ngược lại.

---

## 2. Custom Error Class — BE

```ts
// lib/errors.ts

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

// Subclass cho từng loại
export class ValidationError extends AppError {
  constructor(details: ValidationDetail[]) {
    super("VALIDATION_ERROR", "Request validation failed", 400, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", id ? `${resource} with id "${id}" not found` : `${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 409);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super("FORBIDDEN", message, 403);
    this.name = "ForbiddenError";
  }
}

export class BusinessError extends AppError {
  constructor(code: string, message: string) {
    super(code, message, 422);
    this.name = "BusinessError";
  }
}
```

**Throw đúng loại trong service:**

```ts
// ✅ Rõ ràng, có code, FE switch được
if (!order) throw new NotFoundError("Order", orderId);
if (order.status !== "PENDING") throw new BusinessError("ORDER_NOT_CANCELLABLE", "Only pending orders can be cancelled");
if (order.userId !== requesterId) throw new ForbiddenError();

// ❌ Throw Error thường — FE không biết handle thế nào
throw new Error("Order not found");
```

---

## 3. Error code — convention

```ts
// errors/codes.ts — liệt kê toàn bộ error code
export const ErrorCode = {
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  TOKEN_INVALID: "TOKEN_INVALID",

  // Resource
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",

  // Business
  ORDER_NOT_CANCELLABLE: "ORDER_NOT_CANCELLABLE",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  PAYMENT_DECLINED: "PAYMENT_DECLINED",
  ACCOUNT_SUSPENDED: "ACCOUNT_SUSPENDED",

  // System
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
```

**Nguyên tắc đặt tên error code:**

- `UPPERCASE_SNAKE_CASE`.
- Mô tả vấn đề, không mô tả HTTP method: `ORDER_NOT_FOUND` tốt hơn `GET_ORDER_FAILED`.
- Cụ thể: `INSUFFICIENT_STOCK` tốt hơn `BUSINESS_ERROR`.
- Stable: không đổi tên code khi đã ship — FE đang switch trên đó.

---

## 4. Global error handler — BE

```ts
// middleware/errorHandler.ts
import { AppError } from "@/lib/errors";

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // AppError — lỗi có chủ đích
  if (err instanceof AppError) {
    req.log?.warn({ err, code: err.code }, "Application error");
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Zod validation error
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
      },
    });
  }

  // Prisma known error
  if (err instanceof PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Record not found" } });
    }
    if (err.code === "P2002") {
      return res.status(409).json({ error: { code: "ALREADY_EXISTS", message: "Record already exists" } });
    }
  }

  // Unexpected error — log đầy đủ, không expose ra client
  req.log?.error({ err }, "Unexpected error");
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" },
  });
}
```

---

## 5. FE — Error type và handler

**Type response error:**

```ts
// types/api.ts
export interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export function isApiError(err: unknown): err is AxiosError<ApiErrorResponse> {
  return axios.isAxiosError(err) && err.response?.data?.error !== undefined;
}
```

**Axios interceptor — handle auth error global:**

```ts
axios.interceptors.response.use(
  (res) => res,
  async (err: AxiosError<ApiErrorResponse>) => {
    const code = err.response?.data?.error?.code;

    if (code === "TOKEN_EXPIRED") {
      // Thử refresh token
      const refreshed = await refreshAccessToken();
      if (refreshed) return axios.request(err.config!);
      // Refresh fail → logout
      logout();
      return;
    }
    if (code === "UNAUTHORIZED") {
      logout();
      return;
    }

    return Promise.reject(err);
  },
);
```

**Component error handling:**

```ts
async function cancelOrder(orderId: string) {
  try {
    await orderApi.cancel(orderId);
    toast.success("Đã huỷ đơn hàng");
  } catch (err) {
    if (isApiError(err)) {
      const code = err.response!.data.error.code;
      switch (code) {
        case "ORDER_NOT_CANCELLABLE":
          toast.error("Đơn hàng này không thể huỷ");
          break;
        case "FORBIDDEN":
          toast.error("Bạn không có quyền thực hiện thao tác này");
          break;
        default:
          toast.error("Có lỗi xảy ra, vui lòng thử lại");
      }
    } else {
      toast.error("Không thể kết nối server");
    }
  }
}
```

---

## 6. Error UI — UX tốt khi có lỗi

**Phân cấp error UI:**

```
Field-level error   → inline dưới input (validation)
Form-level error    → banner trên form (business error toàn form)
Page-level error    → Error Boundary, full page fallback
Toast / snackbar    → action error (cancel fail, save fail)
Network error       → offline indicator hoặc retry CTA
```

**Validation error inline:**

```tsx
<input ... aria-invalid={!!errors.email} aria-describedby="email-error" />
{errors.email && (
  <span id="email-error" role="alert" className="field-error">
    {errors.email.message}
  </span>
)}
```

**Error state trong list/page:**

```tsx
if (isError) return <ErrorState title="Không tải được dữ liệu" message="Vui lòng thử lại hoặc liên hệ hỗ trợ" action={<button onClick={() => refetch()}>Thử lại</button>} />;
```

---

## 7. Checklist error design

1. Có custom Error class phân cấp rõ ràng không?
2. Error code là string constant, stable, không đổi sau khi ship?
3. Global error handler có bắt đủ: AppError, ZodError, Prisma error, unexpected?
4. Response 500 không bao giờ expose stack trace hoặc internal message?
5. FE có type ApiError và isApiError guard không?
6. Axios interceptor handle 401/TOKEN_EXPIRED global chưa?
7. Component-level error switch theo error code, không phải message text?
8. Error UI phân cấp đúng: field / form / toast / page?
9. Prisma P2002/P2025 có được map sang HTTP status đúng không?
10. Error code được document ở 1 chỗ, FE và BE cùng dùng file đó không?
