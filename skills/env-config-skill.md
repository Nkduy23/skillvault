# Env & Config Skill — Environment Variables + Secrets

Dùng khi setup project mới, thêm config mới, hoặc review cách quản lý env. Config sai = app crash production hoặc leak secret.

---

## 1. Nguyên tắc cơ bản

- **Không hardcode** bất kỳ giá trị thay đổi theo môi trường: URL, port, secret, API key, timeout.
- **Không commit** `.env` — chỉ commit `.env.example` với placeholder.
- **Validate** env khi app start — fail fast nếu thiếu config quan trọng, không để crash runtime sau.
- **Tách rõ** secret (cần bảo mật) vs config (có thể public) — không nhét chung.

---

## 2. File env theo môi trường

```
.env                  ← local dev (gitignored)
.env.example          ← template, commit lên repo
.env.test             ← test environment (gitignored)
.env.production       ← KHÔNG dùng file này — dùng platform secret manager
```

**.env.example — luôn cập nhật khi thêm var mới:**

```env
# App
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# Auth
JWT_SECRET=your-secret-here-min-32-chars
JWT_ACCESS_TTL=900        # seconds (15 phút)
JWT_REFRESH_TTL=604800    # seconds (7 ngày)

# External services
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Storage
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY=
S3_SECRET_KEY=
```

---

## 3. Validate env khi start — không để thiếu config crash runtime

**BE — dùng Zod validate:**

```ts
// src/config/env.ts
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().default(900),
  JWT_REFRESH_TTL: z.coerce.number().default(604800),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1); // fail fast
}

export const env = parsed.data;
```

**Dùng `env` thay vì `process.env` trực tiếp:**

```ts
// ✅ Type-safe, validated
import { env } from "@/config/env";
const port = env.PORT; // number, không phải string | undefined

// ❌ Không type-safe, có thể undefined
const port = process.env.PORT;
```

**FE (Next.js):**

```ts
// src/config/env.ts
const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL!,
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "My App",
} as const;

// Validate at module load
if (!clientEnv.apiUrl) {
  throw new Error("NEXT_PUBLIC_API_URL is required");
}

export { clientEnv };
```

---

## 4. Phân loại secret vs config

**Secret (nhạy cảm — chỉ ở server, không bao giờ expose FE):**

- Database URL, password.
- JWT secret, session secret.
- API key third-party (Stripe, SendGrid, AWS...).
- Encryption key.
- Webhook secret.

**Config (không nhạy cảm — có thể public):**

- `NEXT_PUBLIC_*` — exposed ở browser.
- App name, version, feature flag, timeout, page size default.
- Public API URL.

**Quy tắc Next.js:**

- `NEXT_PUBLIC_*` → exposed ra client bundle — **không bao giờ** đặt secret vào đây.
- Biến không có prefix → chỉ available ở server (getServerSideProps, API route, server component).

---

## 5. Quản lý secret theo môi trường

**Local dev:**

- `.env` local — mỗi dev tự tạo từ `.env.example`.
- Không share `.env` qua Slack/email — nếu cần share dev secret → dùng password manager.

**Staging / Production:**

- Dùng platform secret manager: Vercel Environment Variables, Railway Variables, AWS Secrets Manager, Doppler.
- Không để secret trong code, Dockerfile, CI config file.
- Rotate secret định kỳ hoặc khi có người rời team.
- Staging không dùng production secret — tách hoàn toàn.

**CI/CD:**

- Secret inject qua CI environment variable (GitHub Actions Secrets, GitLab CI Variables).
- Không print env trong CI log — kiểm tra `echo $SECRET` không xuất hiện trong log.

---

## 6. Feature flags

Dùng env var đơn giản cho feature flag:

```env
FEATURE_NEW_CHECKOUT=true
FEATURE_DARK_MODE=false
```

```ts
const flags = {
  newCheckout: env.FEATURE_NEW_CHECKOUT === "true",
  darkMode: env.FEATURE_DARK_MODE === "true",
} as const;

if (flags.newCheckout) {
  // render new checkout flow
}
```

Nếu flag phức tạp hơn (per-user, A/B test) → dùng service riêng (LaunchDarkly, Flagsmith, hoặc DB-backed flag).

---

## 7. Checklist env review

1. `.env` có trong `.gitignore` không?
2. `.env.example` có được cập nhật với var mới không?
3. App có validate env khi start và fail fast nếu thiếu không?
4. Có `process.env.X` trực tiếp trong code thay vì qua config module không?
5. Có secret nào bị hardcode trong code không?
6. `NEXT_PUBLIC_*` có chứa secret không? (không được)
7. Staging và production có tách secret riêng không?
8. CI log có print secret không?
9. Khi thêm env var mới: đã cập nhật `.env.example` + thông báo team chưa?
