# Auth Skill — Authentication & Authorization

Dùng khi implement hoặc review hệ thống auth. Auth sai là lỗ hổng bảo mật — không rush.

---

## 1. Authentication vs Authorization

- **Authentication** (AuthN): "Bạn là ai?" — verify identity (login, token).
- **Authorization** (AuthZ): "Bạn được làm gì?" — verify permission (role, ownership).
- Luôn xử lý đúng thứ tự: AuthN trước → AuthZ sau. Không skip AuthN để check AuthZ.

---

## 2. JWT — làm đúng cách

**Access token:**

- Short-lived: 15 phút đến 1 giờ.
- Payload chỉ chứa: `sub` (userId), `role`, `iat`, `exp` — không nhét data thừa (PII, password, ...).
- Sign bằng `HS256` (symmetric) hoặc `RS256` (asymmetric — tốt hơn nếu có nhiều service).
- Secret key: `>= 256 bit`, lấy từ env, không hardcode.

**Refresh token:**

- Long-lived: 7-30 ngày.
- Store ở DB (có thể revoke) — không phải stateless như access token.
- Mỗi refresh tạo refresh token mới (rotation) — token cũ invalid ngay.
- Store hash của refresh token trong DB, không store raw.

**Không làm:**

- Không store JWT trong `localStorage` — dễ bị XSS đánh cắp.
- Store access token trong memory (JS variable hoặc Zustand/Context).
- Store refresh token trong `httpOnly` cookie — không accessible bởi JS.
- Không decode JWT ở client để check role — chỉ dùng cho display, không dùng cho access control thật.

**Blacklist / revoke:**

- JWT stateless nên không thể revoke trước `exp` — nếu cần revoke: giảm TTL hoặc dùng DB check.
- Logout: xoá refresh token khỏi DB + xoá cookie — access token tự expire.

---

## 3. Middleware Auth (BE)

**Structure:**

```
authenticate   → verify token, attach user vào req.user
authorize(roles) → check role từ req.user
```

**Authenticate middleware:**

- Extract token từ `Authorization: Bearer <token>` header.
- Verify signature + exp — throw 401 nếu invalid/expired.
- Query user từ DB (hoặc dùng payload nếu tin tưởng) — attach vào `req.user`.
- Không catch lỗi và return null — throw 401 rõ ràng.

**Authorize middleware:**

```ts
authorize("admin"); // exact role
authorize(["admin", "mod"]); // any of roles
authorizeOwner("userId"); // check ownership — req.params.userId === req.user.id
```

**Apply đúng chỗ:**

- Apply ở route level, không ở controller.
- Public route: không có middleware.
- Protected route: `authenticate` trước.
- Role-restricted: `authenticate` + `authorize(role)`.
- Owner-only: `authenticate` + `authorizeOwner`.

---

## 4. RBAC — Role-Based Access Control

**Simple (3-5 role, không thay đổi):**

```ts
enum Role {
  USER = "USER",
  ADMIN = "ADMIN",
  MODERATOR = "MODERATOR",
}
```

- Store role trong JWT payload + DB.
- Check role trong middleware — đủ cho hầu hết app.

**Phức tạp hơn (permission-based):**

- Tách `role` và `permission` — role có nhiều permission.
- Store permission trong DB, cache (Redis/in-memory) — không query mỗi request.
- Check permission thay vì role trong middleware.

**Ownership check:**

- Không chỉ check role — luôn verify "user này có quyền với resource này không?"
- `Order` chỉ được xem bởi `owner` hoặc `admin` — query filter `userId = req.user.id` ở repo.
- Không để client tự declare ownership qua request body.

---

## 5. Password handling

- **Hash:** `bcrypt` với `saltRounds >= 12` (hoặc `argon2`).
- **Không:** MD5, SHA1, SHA256 thuần — không phải password hash.
- **Không:** store plain text, store reversible encryption.
- **Compare:** luôn dùng constant-time compare (`bcrypt.compare`) — tránh timing attack.
- **Reset password:** tạo token ngẫu nhiên (`crypto.randomBytes`), hash trước khi store, TTL 15-30 phút.
- **Đổi password:** invalidate tất cả refresh token cũ.

---

## 6. Cookie security

Khi dùng cookie cho refresh token:

```ts
res.cookie("refreshToken", token, {
  httpOnly: true, // không access được từ JS
  secure: true, // chỉ gửi qua HTTPS
  sameSite: "strict", // CSRF protection
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/api/auth", // chỉ gửi kèm request tới /api/auth
});
```

- `sameSite: 'strict'` nếu FE và BE cùng domain.
- `sameSite: 'none'` nếu cross-site — bắt buộc `secure: true`.

---

## 7. FE — Auth state management

- Access token: store trong memory (biến JS, Zustand, Context) — clear khi refresh trang.
- Refresh token: trong `httpOnly` cookie — FE không đọc được, gửi tự động.
- Khi app load: gọi `/api/auth/refresh` để lấy access token mới từ refresh token trong cookie.
- Axios interceptor: tự động refresh khi nhận 401, retry request gốc — không để từng component tự handle.
- Logout: gọi API xoá refresh token ở server + clear memory.

**Route guard (Next.js):**

- Middleware Next.js cho server-side redirect — không để client-side guard làm điểm chính.
- Check token trong `middleware.ts` → redirect `/login` nếu thiếu.
- Không hardcode role check ở UI mà bỏ qua BE check — UI là display, BE là source of truth.

---

## 8. Checklist auth review

1. Token TTL có hợp lý không? (access ngắn, refresh dài)
2. Refresh token có rotation không? Có store hash không?
3. JWT secret có lấy từ env, đủ dài không?
4. Access token có store trong localStorage không? (không được)
5. Cookie có đủ `httpOnly`, `secure`, `sameSite` không?
6. Password có hash bằng bcrypt/argon2 không?
7. Mọi protected route đều có `authenticate` middleware chưa?
8. Ownership check có nằm ở DB query (không phải chỉ middleware) không?
9. FE có axios interceptor tự refresh không?
10. Logout có invalidate server-side không?
