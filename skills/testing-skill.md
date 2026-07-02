# Testing Skill — Unit & Integration Test FE + BE

Dùng khi viết test hoặc review coverage. Test tốt = code tự document + refactor an toàn. Không test cho có — test cho đúng chỗ.

---

## 1. Triết lý — test cái gì, không test cái gì

**Nên test:**

- Business logic thuần (service, helper, util) — đây là nơi bug ẩn nhiều nhất.
- Edge case: null, empty, boundary value, error path.
- Integration: API endpoint từ route → DB (với DB test hoặc mock).
- Component FE: behavior người dùng thấy — click, submit, hiển thị đúng data.

**Không cần test:**

- Getter/setter đơn giản, constant, enum.
- Implementation detail (tên biến nội bộ, thứ tự gọi hàm nội bộ).
- Third-party library — tin tưởng họ test rồi.
- Style, className — dễ thay đổi, test brittle.

**Nguyên tắc:**

- Test behavior, không test implementation.
- Nếu test phải sửa mỗi khi refactor internals → test đang test sai thứ.
- Test phải đọc như documentation — tên test là spec.

---

## 2. Cấu trúc test file

**Naming:**

```
src/
  modules/order/
    order.service.ts
    order.service.spec.ts     ← unit test, cùng folder
  tests/
    order.e2e.spec.ts         ← integration/e2e test, folder riêng
```

**AAA pattern — Arrange, Act, Assert:**

```ts
it("should return 404 when order not found", async () => {
  // Arrange
  const orderId = "non-existent-id";
  jest.spyOn(orderRepo, "findById").mockResolvedValue(null);

  // Act
  const result = orderService.getOrder(orderId);

  // Assert
  await expect(result).rejects.toThrow(NotFoundException);
});
```

**Tên test rõ ràng — describe + it:**

```ts
describe("OrderService", () => {
  describe("getOrder", () => {
    it("returns order when found");
    it("throws NotFoundException when order not found");
    it("throws ForbiddenException when user does not own order");
  });
  describe("cancelOrder", () => {
    it("cancels order with status PENDING");
    it("throws ConflictException when order is already SHIPPED");
  });
});
```

---

## 3. Unit test — BE (Jest + NestJS/Express)

**Mock đúng chỗ:**

```ts
// Mock repository, không mock service trong unit test service
const mockOrderRepo = {
  findById: jest.fn(),
  update: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks(); // reset mock sau mỗi test
});
```

**Test service:**

```ts
it("calculates total correctly with discount", async () => {
  mockOrderRepo.findById.mockResolvedValue({
    id: "1",
    items: [{ price: 100, quantity: 2 }],
    discount: 10,
  });

  const result = await orderService.getOrderTotal("1");
  expect(result).toBe(190); // 200 - 10
});
```

**Test helper/util thuần:**

```ts
// Không cần mock — hàm thuần, dễ test nhất
describe("calculateDiscount", () => {
  it("returns 0 when no discount code", () => {
    expect(calculateDiscount(100, null)).toBe(0);
  });
  it("applies percentage discount", () => {
    expect(calculateDiscount(100, { type: "percent", value: 10 })).toBe(10);
  });
  it("caps discount at item price", () => {
    expect(calculateDiscount(50, { type: "fixed", value: 100 })).toBe(50);
  });
});
```

**Test async error:**

```ts
// Đúng cách test async throw
await expect(service.doSomething()).rejects.toThrow("message");
await expect(service.doSomething()).rejects.toBeInstanceOf(CustomError);
```

---

## 4. Integration test — BE (API endpoint)

Dùng Supertest + test DB (hoặc mock DB):

```ts
describe("POST /api/v1/orders", () => {
  it("creates order and returns 201", async () => {
    const res = await request(app).post("/api/v1/orders").set("Authorization", `Bearer ${testToken}`).send({ productId: testProduct.id, quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: "PENDING",
      quantity: 2,
    });
  });

  it("returns 400 when quantity is missing", async () => {
    const res = await request(app).post("/api/v1/orders").set("Authorization", `Bearer ${testToken}`).send({ productId: testProduct.id });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
```

**Test DB strategy:**

- Dùng DB riêng cho test (`DATABASE_URL` khác trong `.env.test`).
- `beforeAll`: migrate + seed fixture.
- `afterEach`: cleanup data vừa tạo (không reset toàn DB — chậm).
- `afterAll`: disconnect.
- Không share state giữa các test — mỗi test tự tạo data cần.

---

## 5. Unit test — FE (React Testing Library)

**Nguyên tắc RTL:**

- Query theo những gì user thấy: `getByRole`, `getByLabelText`, `getByText`.
- Không query bằng `className`, `id` CSS, hay implementation detail.
- Không test state trực tiếp — test kết quả hiển thị.

```tsx
it("shows error message when email is invalid", async () => {
  render(<LoginForm />);

  await userEvent.type(screen.getByLabelText("Email"), "not-an-email");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(screen.getByText("Email không hợp lệ")).toBeInTheDocument();
});

it("calls onSubmit with correct data when form is valid", async () => {
  const mockSubmit = jest.fn();
  render(<LoginForm onSubmit={mockSubmit} />);

  await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
  await userEvent.type(screen.getByLabelText("Mật khẩu"), "password123");
  await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));

  expect(mockSubmit).toHaveBeenCalledWith({
    email: "user@example.com",
    password: "password123",
  });
});
```

**Mock API call:**

```tsx
// Dùng msw (Mock Service Worker) — tốt hơn jest.mock fetch
import { rest } from "msw";
import { setupServer } from "msw/node";

const server = setupServer(rest.get("/api/v1/users/me", (req, res, ctx) => res(ctx.json({ data: { id: "1", name: "Test User" } }))));
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

**Test loading + error state:**

```tsx
it("shows loading spinner while fetching", () => {
  server.use(rest.get("/api/v1/orders", (req, res, ctx) => res(ctx.delay(100))));
  render(<OrderList />);
  expect(screen.getByRole("status")).toBeInTheDocument(); // aria-label="loading"
});

it("shows error message on fetch failure", async () => {
  server.use(rest.get("/api/v1/orders", (req, res, ctx) => res(ctx.status(500))));
  render(<OrderList />);
  expect(await screen.findByText(/lỗi tải dữ liệu/i)).toBeInTheDocument();
});
```

---

## 6. Coverage — đừng chase số, chase chất lượng

**Target thực tế:**

- Business logic (service, helper): 80-90%.
- Controller/route: 60-70% (integration test cover).
- UI component: test happy path + error path + loading state.
- Utility function: 100% nếu có edge case.

**Không:**

- Không viết test chỉ để tăng coverage %.
- Không test `if (x) return x` trivial.
- Một test bao gồm quá nhiều assertion → tách thành nhiều test nhỏ hơn.

---

## 7. Checklist test review

1. Tên test có đọc như spec không? (describe + it = câu hoàn chỉnh)
2. Mỗi test chỉ test 1 behavior không?
3. Có `jest.clearAllMocks()` trong `beforeEach` không?
4. Test có phụ thuộc vào thứ tự chạy không? (không được)
5. FE test có dùng `getByRole`/`getByLabelText` thay vì `querySelector` không?
6. Có test error path và edge case không, hay chỉ happy path?
7. Integration test có dùng DB riêng không?
8. Mock có quá chi tiết (mock implementation detail) không?
