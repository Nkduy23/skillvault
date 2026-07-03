# Refactoring Skill — Refactor An Toàn, Không Break

Dùng khi cần cải thiện code đang chạy production. Refactor sai = bug production. Nguyên tắc: không thay đổi behavior, chỉ thay đổi cấu trúc.

---

## 1. Nguyên tắc trước khi bắt đầu

- **Không refactor và thêm feature cùng lúc** — commit riêng, PR riêng. "Tiện tay sửa luôn" là nguồn gốc của bug khó tìm.
- **Có test trước khi refactor** — nếu không có test, viết test trước. Test là safety net. Không có safety net = không nên refactor code production.
- **Refactor theo từng bước nhỏ** — mỗi bước commit được, CI pass được. Không để "refactor lớn" kéo dài 2 tuần chưa merge.
- **Đo trước và sau** — nếu mục đích là performance: benchmark trước, verify sau khi refactor không chậm hơn.

---

## 2. Checklist trước khi refactor

- [ ] Hiểu rõ behavior hiện tại của code — đọc kỹ, không đoán.
- [ ] Có test cover behavior quan trọng không? Nếu chưa → viết test snapshot/integration trước.
- [ ] Scope refactor được giới hạn rõ ràng — biết file nào sẽ thay đổi, file nào không.
- [ ] Có thể deploy từng bước (không phải big bang) không?
- [ ] Có rollback plan không?
- [ ] Đã thông báo cho team không? (tránh conflict với người đang sửa cùng file)

---

## 3. Kỹ thuật refactor cụ thể

### Tách hàm lớn

```ts
// ❌ Hàm làm quá nhiều thứ
async function processOrder(orderId: string) {
  const order = await db.order.findById(orderId);
  // validate...
  // calculate total...
  // apply discount...
  // charge payment...
  // send email...
  // update inventory...
}

// ✅ Tách từng responsibility — mỗi bước có thể test độc lập
async function processOrder(orderId: string) {
  const order = await orderRepo.findByIdOrThrow(orderId);
  validateOrderForProcessing(order);
  const total = calculateOrderTotal(order);
  await chargePayment(order, total);
  await Promise.all([sendOrderConfirmEmail(order), updateInventory(order.items)]);
  return order;
}
```

### Strangler Fig — thay thế dần, không rewrite toàn bộ

```ts
// Thay vì rewrite toàn bộ module cũ → tạo module mới song song
// và chuyển từng endpoint/feature sang dần

// Phase 1: Module mới tồn tại song song
import { legacyOrderService } from "./order.service.legacy";
import { newOrderService } from "./order.service.new";

const getOrder = env.USE_NEW_ORDER_SERVICE ? newOrderService.get : legacyOrderService.get;

// Phase 2: Sau khi verify trên production → xoá legacy
```

### Extract và không thay đổi signature

```ts
// Bước 1: Extract không đổi gì — chỉ di chuyển code
function calculateTotal(items: OrderItem[]) {
  // extract ra
  return items.reduce((sum, item) => sum + item.price * item.qty, 0);
}

// Bước 2: Commit — verify test pass
// Bước 3: Sau đó mới cải thiện implementation nếu cần
```

### Rename an toàn (TypeScript)

```ts
// Bước 1: Thêm alias mới, giữ tên cũ
export const getUserById = findUserById; // alias
export { findUserById }; // giữ tên cũ

// Bước 2: Update tất cả caller dùng tên mới
// Bước 3: Xoá export tên cũ
```

### Đổi interface không breaking

```ts
// Thêm field mới optional trước — backward compatible
interface Order {
  id: string;
  total: number;
  totalWithTax?: number; // optional — code cũ không break
}

// Sau khi đã update tất cả consumer → bỏ optional
interface Order {
  id: string;
  total: number;
  totalWithTax: number; // required
}
```

---

## 4. Refactor database — không lock table

**Thêm column mới (không drop cũ):**

```
Bước 1: Thêm column nullable → deploy migration
Bước 2: Code write vào cả column cũ và mới → deploy
Bước 3: Backfill data cũ sang column mới
Bước 4: Code chỉ đọc column mới → deploy
Bước 5: Bỏ NOT NULL → deploy migration
Bước 6: Drop column cũ → deploy migration
```

**Tách bảng lớn:**

```
Bước 1: Tạo bảng mới, sync data từ bảng cũ
Bước 2: Double write: write vào cả 2 bảng
Bước 3: Verify data sync đủ
Bước 4: Read từ bảng mới
Bước 5: Stop write vào bảng cũ
Bước 6: Drop bảng cũ (sau khi an toàn)
```

---

## 5. Refactor FE — tách component không break

**Tách component — quy trình an toàn:**

```tsx
// Bước 1: Extract component trong cùng file trước
function OrderCard({ order }: { order: Order }) {
  // extract
  return <div>...</div>;
}
export function OrderList({ orders }) {
  return orders.map((o) => <OrderCard key={o.id} order={o} />);
}

// Bước 2: Verify render đúng, không có prop drilling issue
// Bước 3: Move ra file riêng nếu đủ stable
```

**Không tách và thêm logic cùng lúc:**

```tsx
// ❌ Vừa tách component vừa thêm feature mới → không biết bug do đâu
// ✅ Tách trước (commit 1) → thêm feature sau (commit 2)
```

**Migrate state management:**

```tsx
// Chuyển từ useState sang Zustand/React Query — từng component
// Bước 1: Setup store/query mới song song
// Bước 2: Migrate 1 component → verify
// Bước 3: Migrate tiếp, không rollout tất cả cùng lúc
```

---

## 6. Code smell — nhận biết để refactor

| Smell                   | Dấu hiệu                                     | Hướng fix                |
| ----------------------- | -------------------------------------------- | ------------------------ |
| God function            | > 50 dòng, nhiều `if` lồng nhau              | Tách hàm nhỏ             |
| Duplicate code          | Copy-paste logic > 3 lần                     | Extract utility          |
| Long param list         | > 4 param                                    | Gộp thành object         |
| Boolean param           | `doSomething(true, false, true)`             | Tách thành hàm riêng     |
| Nested ternary          | `a ? b ? c : d : e`                          | Early return hoặc switch |
| Magic number            | `if (status === 3)`                          | Named constant           |
| Deep nesting            | > 3 cấp if/for lồng nhau                     | Early return, extract    |
| Comment giải thích code | `// add 1 vì index bắt đầu từ 0`             | Rename biến cho rõ       |
| Feature envy            | Service A gọi quá nhiều method của Service B | Xem lại responsibility   |

---

## 7. Workflow refactor với AI

```
1. Paste code cần refactor + mô tả mục tiêu (tách component / giảm complexity / fix smell)
2. Yêu cầu AI: "Liệt kê vấn đề thấy và đề xuất hướng fix trước, không code ngay"
3. Xác nhận scope: "Chỉ refactor X, không thêm feature, không đổi interface"
4. Refactor từng bước nhỏ, commit từng bước
5. Sau khi xong: chạy test, verify behavior không thay đổi
6. Clean Skill review trước khi merge
```

---

## 8. Checklist refactor

1. Có test cover behavior cần giữ nguyên không?
2. Commit refactor tách khỏi commit thêm feature chưa?
3. Mỗi bước refactor có CI pass không (không để broken state)?
4. Interface public (API, props) có thay đổi không? (không được trong cùng PR nếu không thông báo)
5. DB migration có backward compatible không?
6. Đã verify behavior sau refactor = trước refactor chưa?
7. Code smell mới có được tạo ra không? (refactor tạo smell mới = refactor sai)
8. Scope có bị creep (sửa thêm chỗ không liên quan) không?
