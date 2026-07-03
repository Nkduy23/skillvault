# Deployment Skill — CI/CD, Docker, Rollback

Dùng khi setup pipeline deploy mới, review process deploy hiện tại, hoặc chuẩn bị deploy lên production. Deploy sai = downtime. Deploy không có rollback plan = thức đêm.

---

## 1. Nguyên tắc deploy an toàn

- **Mọi deploy đều phải có rollback plan** trước khi bấm nút.
- **Deploy thường xuyên, thay đổi nhỏ** — dễ rollback, dễ tìm nguyên nhân khi lỗi.
- **Không deploy vào cuối ngày thứ Sáu** (hoặc ngay trước holiday).
- **Staging phải mirror production** — nếu staging khác production, staging vô dụng.
- **Database migration và code deploy là 2 bước riêng** — không làm cùng lúc.

---

## 2. CI/CD pipeline cơ bản

**Thứ tự stages:**

```
1. lint + type check      ← fail fast, nhanh nhất
2. unit test
3. build
4. integration test       ← chạy với test DB
5. deploy staging         ← auto khi merge vào develop
6. smoke test staging     ← tự động gọi vài endpoint critical
7. deploy production      ← manual trigger hoặc auto khi merge vào main
8. smoke test production
```

**GitHub Actions example (Node.js):**

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --coverage

  build:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t myapp:${{ github.sha }} .
      - run: docker push ghcr.io/org/myapp:${{ github.sha }}

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/deploy.sh staging ${{ github.sha }}

  deploy-production:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production # require manual approval
    steps:
      - run: ./scripts/deploy.sh production ${{ github.sha }}
```

---

## 3. Docker — best practices

**Dockerfile cho Node.js:**

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Production stage
FROM node:20-alpine AS runner
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/node_modules ./node_modules
COPY . .
RUN npm run build

USER appuser
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

**Nguyên tắc:**

- Multi-stage build — image production không có devDependencies, source map, test file.
- Không chạy với `root` user — tạo user riêng.
- `.dockerignore` phải có: `node_modules`, `.env`, `.git`, `dist`, `coverage`.
- Layer caching: `COPY package*.json` → `RUN npm ci` → `COPY . .` — thứ tự này tối ưu cache.
- Image tag bằng git SHA, không phải `latest` — `latest` không biết đang chạy version nào.

**.dockerignore:**

```
node_modules
.env
.env.*
.git
dist
build
coverage
*.log
.DS_Store
```

---

## 4. Database migration — deploy đúng thứ tự

**Vấn đề:** code mới cần schema mới → nhưng nếu migrate và deploy cùng lúc, có khoảng thời gian code cũ chạy với schema mới (hoặc ngược lại) → crash.

**Thứ tự an toàn (backward compatible migration):**

```
Bước 1: Deploy migration (thêm column/table mới, nullable)
Bước 2: Deploy code mới (dùng column mới)
Bước 3: (nếu cần) Backfill data cũ
Bước 4: (sau khi ổn định) Deploy migration cleanup (add NOT NULL constraint, drop column cũ)
```

**Ví dụ đổi tên column an toàn:**

```
❌ Đổi tên trực tiếp: ALTER TABLE orders RENAME COLUMN name TO title
   → Code cũ đang chạy dùng `name` sẽ crash

✅ Thêm column mới `title`, giữ `name`:
   1. Migrate: ADD COLUMN title VARCHAR(255)
   2. Deploy code: write vào cả `name` và `title`
   3. Backfill: UPDATE orders SET title = name WHERE title IS NULL
   4. Deploy code: chỉ đọc `title`
   5. Migrate cleanup: DROP COLUMN name
```

**Không bao giờ làm trong 1 deploy:**

- DROP COLUMN đang được dùng.
- Rename column/table đang được dùng.
- Thêm NOT NULL constraint mà không có default hoặc backfill.
- Đổi type column.

---

## 5. Zero-downtime deploy

**Blue-Green deploy:**

```
Production hiện tại = Blue (đang chạy)
Deploy version mới = Green (warm up)
Switch traffic: Blue → Green
Nếu lỗi: switch lại Blue ngay lập tức
```

**Rolling deploy (Kubernetes / Docker Swarm):**

- Deploy từng instance một, không down toàn bộ.
- Health check phải pass trước khi instance cũ bị terminate.
- `terminationGracePeriodSeconds`: cho phép instance cũ finish request đang xử lý.

**Health check endpoint:**

```ts
// GET /health
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`; // check DB
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

// GET /ready — readiness probe (khác với liveness)
app.get("/ready", (req, res) => {
  if (isReady) res.json({ status: "ready" });
  else res.status(503).json({ status: "not ready" });
});
```

---

## 6. Rollback plan — luôn có trước khi deploy

**Trước mỗi production deploy, trả lời:**

```
1. Cách rollback code: [revert commit SHA, re-deploy version cũ]
2. Cách rollback DB: [migration có down script không? data có thể restore không?]
3. Feature flag: có thể tắt feature mới mà không rollback không?
4. Ai có quyền rollback? Ai cần thông báo?
5. Bao lâu sau deploy thì tuyên bố "ổn"?
```

**Rollback code:**

```bash
# Re-deploy image cũ (nếu dùng Docker)
docker service update --image myapp:PREVIOUS_SHA myapp

# Hoặc revert commit + re-run pipeline
git revert HEAD
git push origin main
```

**Rollback DB migration:**

- Prisma không có built-in down migration — luôn viết SQL rollback script thủ công trước khi apply.
- Backup DB trước migration quan trọng.
- Test rollback script trên staging trước.

---

## 7. Checklist trước khi deploy production

**Code:**

- [ ] Test pass trên CI.
- [ ] Deploy lên staging và smoke test xong.
- [ ] PR đã được review và merge đúng branch.
- [ ] Không có `console.log`, debug code, TODO critical.

**Database:**

- [ ] Migration đã test trên staging.
- [ ] Migration backward compatible với code hiện tại.
- [ ] Có backup DB (auto hoặc manual) trước migration lớn.
- [ ] Rollback SQL script đã viết sẵn.

**Config:**

- [ ] Env var mới đã được set trên production.
- [ ] Secret mới đã được thêm vào secret manager.

**Deploy:**

- [ ] Biết rollback bằng cách nào.
- [ ] Health check endpoint hoạt động.
- [ ] Alert/monitoring đang chạy.
- [ ] Không deploy vào cuối ngày thứ Sáu.

**Sau deploy:**

- [ ] Smoke test production (gọi thủ công các flow critical).
- [ ] Theo dõi error rate 15-30 phút đầu.
- [ ] Log không có ERROR bất thường.
