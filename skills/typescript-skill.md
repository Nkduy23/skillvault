# TypeScript Skill — Pattern & Utility Type thực tế

Dùng khi viết TS hoặc review type. Mục tiêu: type an toàn thật sự, không phải type cho có — không `any`, không `as X` vô căn cứ.

---

## 1. Utility type hay dùng nhất

```ts
// Chọn field
Pick<User, "id" | "name" | "email">;

// Loại bỏ field
Omit<User, "password" | "deletedAt">;

// Tất cả field optional
Partial<UpdateUserDto>;

// Tất cả field required
Required<UserConfig>;

// Tất cả field readonly
Readonly<AppConfig>;

// Record key-value map
Record<UserId, OrderCount>; // thay vì { [key: string]: number }

// Extract/Exclude từ union
type AdminRoutes = Extract<Route, "/admin" | "/dashboard">;
type PublicRoutes = Exclude<Route, AdminRoutes>;

// Return type của function
ReturnType<typeof getUserById>; // không cần định nghĩa tay

// Parameters của function
Parameters < typeof createOrder > [0]; // lấy type của param đầu tiên

// Awaited — unwrap Promise
Awaited<ReturnType<typeof fetchUser>>; // thay vì Promise<User>
```

---

## 2. Generic — khi nào dùng

**Hàm generic:**

```ts
// Thay vì: function first(arr: any[]): any
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

// API response wrapper
type ApiResponse<T> = { data: T; meta?: PaginationMeta };
type UserResponse = ApiResponse<User>;
type OrderListResponse = ApiResponse<Order[]>;
```

**Generic với constraint:**

```ts
// T phải có field id
function findById<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}

// T phải là key của object U
function pluck<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

**Không over-generic:** nếu chỉ dùng 1 type cụ thể → không cần generic. Generic cho reusability, không phải cho "trông xịn".

---

## 3. Type guard — thay vì `as X`

```ts
// Thay vì: const user = data as User
function isUser(data: unknown): data is User {
  return typeof data === "object" && data !== null && "id" in data && "email" in data;
}

// Dùng:
if (isUser(data)) {
  console.log(data.email); // type safe
}
```

**Discriminated union + exhaustive check:**

```ts
type Action = { type: "CREATE"; payload: CreateDto } | { type: "UPDATE"; payload: UpdateDto } | { type: "DELETE"; id: string };

function handle(action: Action) {
  switch (action.type) {
    case "CREATE":
      return handleCreate(action.payload);
    case "UPDATE":
      return handleUpdate(action.payload);
    case "DELETE":
      return handleDelete(action.id);
    default:
      // Exhaustive check — TS báo lỗi nếu thiếu case
      const _exhaustive: never = action;
      throw new Error(`Unhandled: ${_exhaustive}`);
  }
}
```

---

## 4. Enum — dùng const object, không dùng TS enum

```ts
// ❌ TS enum — tạo JS artifact, tree-shake kém
enum Status {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
}

// ✅ Const object + infer type
const Status = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
} as const;
type Status = (typeof Status)[keyof typeof Status];
// type Status = 'ACTIVE' | 'INACTIVE'
```

---

## 5. Mapped type và conditional type thực tế

```ts
// Tạo type từ object key
type UserFormFields = {
  [K in keyof User as `${K}Error`]?: string;
};
// → { idError?: string; nameError?: string; ... }

// Optional theo điều kiện
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// Loại bỏ null/undefined khỏi type
type NonNullable<T> = T extends null | undefined ? never : T;
// (đã có sẵn trong TS, nhưng biết cách viết để hiểu)

// Infer từ generic
type UnpackArray<T> = T extends (infer Item)[] ? Item : T;
type UserItem = UnpackArray<User[]>; // → User
```

---

## 6. Xử lý unknown và external data

**API response — validate bằng Zod:**

```ts
import { z } from 'zod';

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(['USER', 'ADMIN']),
  createdAt: z.string().datetime(),
});
type User = z.infer<typeof UserSchema>;

// Dùng:
const user = UserSchema.parse(apiResponse.data); // throw nếu sai
// hoặc
const result = UserSchema.safeParse(apiResponse.data);
if (result.success) { ... }
```

**JSON.parse luôn trả `any` → wrap:**

```ts
function safeParseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
```

---

## 7. Pattern thực tế hay dùng

**Builder pattern cho config phức tạp:**

```ts
class QueryBuilder<T> {
  private filters: Partial<T> = {};
  where(filter: Partial<T>) {
    this.filters = { ...this.filters, ...filter };
    return this;
  }
  build() {
    return this.filters;
  }
}
```

**Result type — thay vì throw:**

```ts
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function fetchUser(id: string): Promise<Result<User>> {
  try {
    const user = await userRepo.findById(id);
    if (!user) return { ok: false, error: new Error("Not found") };
    return { ok: true, value: user };
  } catch (e) {
    return { ok: false, error: e as Error };
  }
}
```

**Branded type — tránh nhầm primitive:**

```ts
type UserId = string & { readonly __brand: 'UserId' }
type OrderId = string & { readonly __brand: 'OrderId' }

function getOrder(orderId: OrderId) { ... }
// getOrder(userId) → TS error — dù cả 2 đều là string
```

---

## 8. Checklist TS review

1. Có `any` / `unknown` không được handle không?
2. Có `as X` không có type guard thật không?
3. Có dùng TS `enum` keyword không? → đổi sang const object.
4. API response có được validate bằng Zod không?
5. Có generic thừa (chỉ dùng 1 type cụ thể) không?
6. Có discriminated union nào thiếu exhaustive check không?
7. Có `React.FC` không? → đổi sang function thường.
8. Return type function quan trọng có được annotate rõ không?
