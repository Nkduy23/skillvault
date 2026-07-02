# API Design Skill — REST API chuẩn

Dùng trước khi code bất kỳ endpoint nào. Design trước → code sau. API là contract — sai từ đầu thì sửa rất đau.

---

## 1. URL design

**Nguyên tắc:**

- Resource là **danh từ, số nhiều**: `/users`, `/orders`, `/products`.
- Không dùng động từ trong URL: ❌ `/getUser`, `/createOrder`, `/deleteProduct`.
- Dùng HTTP method để express action:
  ```
  GET    /users          → list
  GET    /users/:id      → detail
  POST   /users          → create
  PUT    /users/:id      → replace toàn bộ
  PATCH  /users/:id      → update một phần
  DELETE /users/:id      → xoá
  ```
- Nested resource khi có relation rõ ràng: `/orders/:orderId/items` — nhưng không lồng quá 2 cấp.
- Action không fit CRUD → dùng sub-resource: `POST /orders/:id/cancel`, `POST /users/:id/verify-email`.

**Versioning:**

- Prefix version từ đầu: `/api/v1/...` — dù chưa có v2, để sau dễ nâng.
- Version trong URL (không dùng header version) — dễ test, dễ cache.

**Casing:**

- URL: **kebab-case** — `/product-variants`, `/order-items`.
- Query param: **camelCase** — `?pageSize=10&sortBy=createdAt`.

---

## 2. Request design

**Query params (GET):**

```
?page=1&pageSize=20          → pagination
?sortBy=createdAt&order=desc → sorting
?status=active&role=admin    → filtering
?q=search+term               → search
?fields=id,name,email        → field selection (nếu cần)
```

- Luôn có default cho `page` (1) và `pageSize` (20), có max cho `pageSize` (100).
- `sortBy` chỉ nhận whitelist field — không cho sort tuỳ ý (SQL injection risk).

**Request body (POST/PUT/PATCH):**

- Content-Type: `application/json` mặc định.
- PATCH: chỉ gửi field cần update, không phải toàn bộ object.
- PUT: gửi toàn bộ object — nếu không confirm replace toàn bộ → dùng PATCH.
- Không nhận `id` trong body cho POST — ID do server tạo.
- Không nhận `createdAt`/`updatedAt` từ client — server tự set.

---

## 3. Response design

**Success response — nhất quán:**

```json
// Single resource
{
  "data": { "id": "...", "name": "..." }
}

// List resource
{
  "data": [...],
  "meta": {
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "totalPages": 5
  }
}

// Action (không có data trả về)
{
  "success": true,
  "message": "Order cancelled successfully"
}
```

**Error response — nhất quán:**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [{ "field": "email", "message": "Invalid email format" }]
  }
}
```

- `code`: string constant, để FE switch/case — không trả message text raw làm code key.
- `message`: human-readable, cho log/debug.
- `details`: array cho validation error nhiều field.
- **Không** trả stack trace ra client trong production.

**HTTP Status code:**

```
200 OK             → GET, PATCH, PUT thành công
201 Created        → POST tạo mới thành công
204 No Content     → DELETE thành công (không có body)
400 Bad Request    → Validation fail, request sai format
401 Unauthorized   → Chưa auth (thiếu/sai token)
403 Forbidden      → Đã auth nhưng không có quyền
404 Not Found      → Resource không tồn tại
409 Conflict       → Duplicate, version conflict
422 Unprocessable  → Input hợp lệ về format nhưng sai nghiệp vụ
429 Too Many Req   → Rate limit
500 Internal Error → Lỗi server không mong đợi
```

---

## 4. Naming nhất quán

- Response field: **camelCase** thống nhất toàn API.
- Boolean field: `isActive`, `hasPermission`, `canEdit` — không phải `active`, `permission`, `edit`.
- ID field: luôn là `id` (không phải `userId` trong response của `/users/:id`).
- Timestamp: `createdAt`, `updatedAt`, `deletedAt` — ISO 8601 string (`2024-06-01T12:00:00.000Z`).
- Enum value trong response: `UPPERCASE_SNAKE` — `"status": "IN_PROGRESS"`.
- Không mix convention trong cùng 1 API — nếu legacy có sai → note rõ, đừng follow cái sai.

---

## 5. Pagination — làm đúng từ đầu

**Offset pagination** (đơn giản, phổ biến):

```
GET /orders?page=1&pageSize=20
```

- Phù hợp: data ít thay đổi, cần nhảy trang tự do.
- Nhược: page drift khi data insert/delete giữa các request.

**Cursor pagination** (stable, scale tốt hơn):

```
GET /orders?cursor=eyJpZCI6IjEyMyJ9&pageSize=20
```

- Phù hợp: feed realtime, data lớn, infinite scroll.
- `cursor` là opaque string (base64 encode), không expose raw ID/offset.
- Response thêm `nextCursor: "..."` (null nếu hết).

Chọn đúng từ đầu — migration giữa 2 loại này ảnh hưởng cả FE lẫn BE.

---

## 6. Security checklist khi design

- [ ] Endpoint nào cần auth? Ghi rõ trong spec.
- [ ] Endpoint nào cần role cụ thể? (admin, user, moderator...)
- [ ] ID trong URL có thể bị brute force/enumerate không? → dùng cuid/uuid.
- [ ] Có trả về data của user khác không? → luôn filter theo `userId` từ token.
- [ ] Có field nhạy cảm trong response không? (password hash, token, PII) → loại bỏ khỏi select.
- [ ] Endpoint có thể bị abuse không? → rate limit.
- [ ] File upload: có validate type, size, scan không?

---

## 7. Checklist trước khi code endpoint

1. URL đúng convention (danh từ số nhiều, kebab-case)?
2. Method đúng với action?
3. Request/response shape đã thống nhất với FE?
4. Error case nào cần handle? Status code phù hợp?
5. Pagination: offset hay cursor? Đã có meta field?
6. Auth/role: endpoint này yêu cầu gì?
7. Response có field nhạy cảm cần loại bỏ không?
8. Naming có nhất quán với các endpoint đã có không?
