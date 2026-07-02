# DB Schema Skill — Prisma Schema + Migration

Dùng khi thiết kế schema mới hoặc review schema hiện tại. Chạy trước khi viết migration, không phải sau.

---

## 1. Naming convention

- Tên model: **PascalCase, số ít** — `User`, `Order`, `ProductVariant` (không phải `users`, `Orders`).
- Tên field: **camelCase** — `createdAt`, `userId`, `isActive`.
- Tên bảng DB map: `@@map("users")` — lowercase, snake_case, số nhiều.
- Tên field DB map: `@map("created_at")` — luôn map nếu DB convention là snake_case.
- Tên relation field: đặt tên mô tả quan hệ, không chỉ là tên model — `author` thay vì `user` nếu role là tác giả.
- Foreign key: `userId` (camelCase) map sang `user_id` (DB).
- Index name: `@@index([field], name: "idx_table_field")` — đặt tên rõ để dễ drop sau.

---

## 2. Field design — nghĩ kỹ từng field

**Nullable hay không?**

- Mặc định **không nullable** trừ khi có lý do rõ ràng.
- `String?` nghĩa là "field này có thể vắng mặt về mặt nghiệp vụ" — không phải "mình chưa chắc".
- Không để nullable chỉ vì "tiện migrate" — sẽ tạo ra bug `undefined` ở tầng code.

**String length:**

- Đừng để tất cả là `String` không giới hạn — xác định `@db.VarChar(255)` hay `@db.Text`.
- `VarChar(255)`: tên, email, slug, URL ngắn.
- `Text`: description, content, note, JSON string.

**Number:**

- Phân biệt `Int` vs `Float` vs `Decimal` — tiền tệ dùng `Decimal`, không dùng `Float` (floating point error).
- ID: dùng `String @default(cuid())` hoặc `String @default(uuid())` — tránh auto-increment Int nếu sẽ expose ra API.

**Timestamp:**

- Luôn có `createdAt DateTime @default(now())`.
- Có `updatedAt DateTime @updatedAt` nếu cần track thay đổi.
- Timezone: Prisma store UTC — handle convert ở tầng app, không ở DB.

---

## 3. Relation design

**One-to-Many:**

```prisma
model User {
  id     String  @id @default(cuid())
  orders Order[]
}
model Order {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])
}
```

- Foreign key luôn nằm ở phía "many".
- Luôn có `@relation` rõ ràng — không để Prisma tự suy.

**Many-to-Many:**

- Dùng explicit junction table (không dùng implicit `@@relation`) nếu junction table có thêm field.
- Junction table đặt tên: `UserRole`, `PostTag`, `OrderProduct`.

**Self-relation:**

- Phổ biến cho category cây, comment thread — đặt tên `parent`/`children` rõ ràng.

**Cascade:**

- Xác định rõ `onDelete`: `Cascade`, `Restrict`, `SetNull` — không để default nếu có nghiệp vụ xoá.
- `Restrict`: xoá parent fail nếu còn child (an toàn nhất cho data quan trọng).
- `Cascade`: xoá parent → xoá hết child (dùng cẩn thận, ghi rõ comment lý do).
- `SetNull`: xoá parent → child.field = null (field phải nullable).

---

## 4. Index strategy

**Luôn index:**

- Foreign key (`userId`, `orderId`...) — Prisma không tự tạo index cho FK.
- Field dùng trong `where` thường xuyên: `email`, `slug`, `status`, `isActive`.
- Field dùng trong `orderBy`: `createdAt`, `position`, `score`.

**Composite index:**

- `@@index([userId, status])` nếu hay query `where: { userId, status }` cùng nhau.
- Thứ tự field trong composite index quan trọng — field có cardinality cao đặt trước.

**Unique:**

- `@unique` cho email, username, slug — tạo unique constraint ở DB, không chỉ validate ở code.
- `@@unique([userId, postId])` cho junction table thay vì `@id` composite.

**Không over-index:**

- Index làm chậm write — chỉ thêm index cho field thật sự query thường xuyên.
- Sau khi add nhiều index: review lại bằng `EXPLAIN ANALYZE` nếu có quyền truy cập DB.

---

## 5. Soft delete pattern

Khi nào dùng soft delete:

- Data cần audit trail (đơn hàng, giao dịch, user account).
- Data có thể cần restore.
- Data được reference bởi bảng khác (hard delete gây FK constraint).

```prisma
model Order {
  deletedAt DateTime?
  // ...
}
```

- Filter mọi query production: `where: { deletedAt: null }`.
- Tạo helper/middleware filter tự động — đừng nhớ thêm tay vào từng query.
- Không soft delete data nhỏ, ít quan trọng, không có relation — xoá thật cho gọn.

---

## 6. Migration discipline

**Naming:** `[timestamp]_[verb]_[subject]_[field]`

```
20240601120000_add_deletedAt_to_orders
20240602_create_product_variant_table
20240603_add_index_userId_on_orders
```

**Checklist trước khi chạy migration production:**

- [ ] Migration có `--create-only` review trước khi apply không?
- [ ] Migration có destructive action không? (DROP COLUMN, DROP TABLE, ALTER TYPE) → backup trước.
- [ ] Thêm column NOT NULL trên bảng lớn? → cần default value hoặc làm 2 bước (thêm nullable → backfill → add constraint).
- [ ] Đổi tên column/table? → Prisma tạo DROP + ADD, không phải RENAME — data mất. Dùng `@map` thay thế.
- [ ] Migration có thể rollback không? Có plan B không?

**Không làm:**

- Không edit file migration đã chạy.
- Không xoá migration đã apply.
- Không sửa schema rồi `prisma migrate reset` trên production.

---

## 7. Checklist review schema

1. Tên model/field có đúng convention không?
2. Có field nullable không cần thiết không?
3. FK có được index không?
4. Có field thường xuyên query/sort mà thiếu index không?
5. Relation có `onDelete` rõ ràng không?
6. Dùng `Float` cho tiền/số chính xác không? → đổi `Decimal`.
7. ID có expose ra API không? Nếu có → dùng cuid/uuid.
8. Soft delete có được filter đồng nhất ở mọi query không?
9. Migration tên có đúng convention, có review trước apply không?
10. Junction table many-to-many có explicit hay implicit?
