# Security Checklist Skill — OWASP, Headers, CORS, Input

Dùng trước khi launch, hoặc review security định kỳ. Security không phải afterthought — fix security bug sau khi đã có data thật sẽ rất đau.

---

## 1. Input validation & Injection

**SQL Injection:**

- Prisma ORM tự parameterize → an toàn với query thông thường.
- `$queryRaw` với string nối trực tiếp → SQL injection:
  ```ts
  // ❌
  await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = '${userId}'`);
  // ✅
  await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;
  ```
- Không bao giờ build query string từ user input.

**NoSQL Injection (MongoDB):**

- Không dùng user input trực tiếp làm operator: `{ $where: userInput }`.
- Validate và whitelist operator nếu cần dynamic query.

**Command Injection:**

- Không truyền user input vào `exec`, `spawn`, `eval`.
- Nếu cần shell command: whitelist argument, không interpolate string.

**XSS (Cross-Site Scripting):**

- React tự escape JSX → an toàn cho text content.
- `dangerouslySetInnerHTML` → chỉ dùng với nội dung đã sanitize (DOMPurify).
- Content-Security-Policy header để giảm impact khi có XSS.

---

## 2. Authentication & Session

- [ ] JWT secret >= 32 bytes, từ env.
- [ ] Access token TTL ngắn (15-60 phút).
- [ ] Refresh token rotation: mỗi lần refresh tạo token mới, revoke token cũ.
- [ ] Refresh token store hashed trong DB (không plain text).
- [ ] Refresh token trong `httpOnly` cookie (`secure: true`, `sameSite: 'strict'`).
- [ ] Logout invalidate refresh token phía server.
- [ ] Rate limit login endpoint (5-10 lần/phút per IP).
- [ ] Brute force protection: lockout sau N lần fail.
- [ ] Password hash bằng bcrypt/argon2 (`saltRounds >= 12`).
- [ ] Reset password token: random, hashed, TTL 15-30 phút, single-use.

---

## 3. Authorization

- [ ] Mọi protected route có `authenticate` middleware.
- [ ] Role check ở middleware, không chỉ ở UI.
- [ ] Ownership check trong DB query: `where: { id, userId: req.user.id }` — không chỉ check role.
- [ ] Admin endpoint không accessible với user role thường.
- [ ] IDOR (Insecure Direct Object Reference): ID trong URL không cho phép access resource của user khác.
- [ ] Horizontal privilege escalation: user A không xem/sửa được data user B.

---

## 4. HTTP Security Headers

Setup với `helmet` (Express) hoặc `next.config.js`:

```ts
// Express
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'nonce-{nonce}'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", env.CDN_URL],
        connectSrc: ["'self'", env.API_URL],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
);
```

```js
// next.config.js headers
{
  key: 'X-Frame-Options', value: 'SAMEORIGIN'         // chống clickjacking
  key: 'X-Content-Type-Options', value: 'nosniff'     // chống MIME sniffing
  key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin'
  key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()'
}
```

**Headers quan trọng:**

- `Strict-Transport-Security`: force HTTPS.
- `Content-Security-Policy`: whitelist nguồn script/style.
- `X-Frame-Options`: ngăn embed trong iframe (clickjacking).
- `X-Content-Type-Options: nosniff`: ngăn browser đoán MIME type.

---

## 5. CORS — cấu hình đúng

```ts
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [env.FE_URL, env.ADMIN_URL];
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true, // cho phép cookie cross-origin
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
```

**Không làm:**

- `origin: '*'` với `credentials: true` — browser reject, và không an toàn.
- `origin: true` (reflect origin) — cho phép mọi origin.
- Không set CORS → chặn hết, hoặc set sai → mở toang.

---

## 6. Rate limiting

```ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 100, // 100 request / 15 phút / IP
  store: new RedisStore({ client: redis }),
  standardHeaders: true,
  message: { error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many requests" } },
});

// Strict cho auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 lần login attempt / 15 phút
  store: new RedisStore({ client: redis }),
  skipSuccessfulRequests: true, // chỉ đếm lần fail
});

app.use("/api", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/forgot-password", authLimiter);
```

---

## 7. Sensitive data exposure

- [ ] Response không chứa `password`, `passwordHash`, token, secret key.
- [ ] Prisma `select` explicit — không trả về toàn bộ record.
- [ ] Log không chứa PII (email, phone, address, CMND...).
- [ ] Stack trace không expose ra client (chỉ log server-side).
- [ ] `.env` không bao giờ commit vào git.
- [ ] S3 bucket không public trừ khi cần thiết — dùng presigned URL.
- [ ] Error message không tiết lộ implementation detail (tên bảng, cấu trúc DB).

---

## 8. Dependency security

```bash
# Kiểm tra vulnerability trong dependency
npm audit
npm audit fix

# Tự động check trong CI
npm audit --audit-level=high --ci
```

- Update dependency thường xuyên, đặc biệt security patch.
- Không dùng package không được maintain > 2 năm cho component quan trọng.
- Kiểm tra `npm install` trước khi dùng package mới: số download, maintainer, license.

---

## 9. File upload security

- [ ] Validate MIME type từ buffer (không phải Content-Type header).
- [ ] Giới hạn file size ở middleware.
- [ ] Rename file khi lưu (không dùng tên từ client).
- [ ] Không execute file upload — lưu trên S3, không trên server disk.
- [ ] Image: xử lý qua sharp trước khi serve (xoá EXIF data có thể chứa GPS location).

---

## 10. Checklist bảo mật trước launch

**Input:**

- [ ] Tất cả endpoint có Zod validate không?
- [ ] Không có `$queryRawUnsafe` với user input?
- [ ] Không có `dangerouslySetInnerHTML` chưa sanitize?

**Auth:**

- [ ] JWT secret đủ mạnh, từ env?
- [ ] Refresh token rotation + httpOnly cookie?
- [ ] Rate limit login/forgot password?

**Authorization:**

- [ ] Mọi protected route có middleware?
- [ ] Ownership check trong DB query?

**Headers:**

- [ ] Helmet/CSP được setup?
- [ ] CORS whitelist đúng origin?
- [ ] HTTPS được enforce (HSTS)?

**Data:**

- [ ] Sensitive field không có trong response?
- [ ] Log không có PII?
- [ ] `.env` không trong git history?

**Dependency:**

- [ ] `npm audit` pass không có high/critical?

**Rate limit:**

- [ ] Auth endpoint có rate limit?
- [ ] Upload endpoint có rate limit?
