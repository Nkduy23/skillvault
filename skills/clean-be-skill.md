# Clean BE Skill — Express / NestJS + Prisma + Zod

Dùng khi được yêu cầu "clean module BE này". Scan toàn bộ file trong scope, áp dụng quy ước theo thứ tự. Không hỏi lại trừ khi phát hiện bug logic thật sự hoặc cần xác nhận hướng refactor lớn.

---

## 1. Layering — phân tách đúng tầng

- **route.ts**: import `* as controller`, `* as validator`. Validate (`validate(schema, "query"|"params"|"body")`) chỉ ở middleware route — đây là layer DUY NHẤT chịu validate. Field nhóm theo block (Public / Admin / ...) với comment 1 dòng.
- **controller.ts**: import `* as xService` (namespace nhất quán, không import lẻ trùng). **Không** `.parse()` lại query/params đã được middleware validate — chỉ cast type `req.query as unknown as z.infer<typeof schema>`. Ngoại lệ: body multipart (kèm file upload) validate ở controller sau `parseMultipartData` vì middleware không xử lý multipart JSON string.
- **service.ts**: import `* as repo`, `* as helpers`. Không `as any` nếu type Prisma select đã có field đó — kiểm tra `select` trước khi cast. Logic cascade/transaction thuần DB → dời sang `helpers.ts`. Xoá dead code ngay khi phát hiện.
- **repository.ts**: chỉ chứa Prisma query thuần. Giữ `select` rõ ràng, comment nhóm ngắn (`// FINDS`, `// MUTATIONS`, `// CHECKS`).
- **helpers.ts**: utility thuần (upload ảnh, parse multipart, cascade DB). Luôn check import path đúng alias dự án — path lạ/không nhất quán là dấu hiệu bug.
- **validation.ts**: Zod schema. Query string → `z.coerce.number()` / `booleanQuery` transform. JSON body → `z.number()` / `z.boolean()` thuần. Export type bằng `z.infer<typeof schema>`, không định nghĩa tay trùng lặp.

---

## 2. Performance — phát hiện sớm, báo cáo rõ

### 2a. Query Prisma

- **N+1 query**: loop gọi `findUnique`/`findFirst` bên trong vòng lặp → gộp thành 1 query `findMany` + Map bằng ID. Báo ngay khi phát hiện.
- **Select quá rộng**: `findMany` không có `select` hoặc `include` vô hạn → gợi ý thêm `select` chỉ lấy field cần thiết.
- **Missing index nguy hiểm**: filter/orderBy trên field thường xuyên mà không có `@@index` trong schema → báo, để dev kiểm tra DB.
- **Pagination thiếu**: query trả về list mà không có `take`/`skip` hoặc cursor → báo nguy cơ full table scan.
- **Count + findMany cùng bảng**: nếu gọi 2 lần riêng → gợi ý dùng `prisma.$transaction([count, findMany])` để giảm round-trip.
- **`include` lồng sâu > 2 cấp**: cân nhắc tách thành query riêng + join ở service, tránh over-fetching.

### 2b. Controller / Service

- **Blocking I/O trong vòng lặp**: `await` trong `for...of` khi các task độc lập → đổi sang `Promise.all` / `Promise.allSettled`.
- **Heavy computation đồng bộ** (parse, transform, sort mảng lớn) trong request handler → cân nhắc offload sang queue hoặc worker thread; ít nhất phải tách hàm riêng để dễ đo.
- **File upload không giới hạn size**: middleware upload thiếu `limits.fileSize` → báo ngay, gợi ý thêm.
- **Response payload thừa**: trả về toàn bộ Prisma object khi client chỉ cần vài field → thêm `select` hoặc map trước khi response.

### 2c. Caching

- Nếu endpoint đọc dữ liệu ít thay đổi (config, danh mục, lookup table) và không có caching → đề xuất thêm cache (in-memory với TTL, Redis, hoặc HTTP cache header tuỳ context).
- Nếu đã có cache: kiểm tra TTL có hợp lý không, cache key có bao gồm đủ param phân biệt không (tránh cache poisoning).

---

## 3. An toàn và bảo mật

- **SQL injection qua Prisma raw query**: nếu dùng `$queryRaw` / `$executeRaw` với string nối trực tiếp → báo ngay, đổi sang `$queryRaw` với tagged template hoặc Prisma query API.
- **Input không được sanitize trước khi log**: tránh log `req.body` raw trong production — có thể lộ PII hoặc làm log injection.
- **Error message lộ stack trace ra client**: `res.json({ error: err.message })` → chỉ trả mã lỗi chung, log chi tiết phía server.
- **Rate limit thiếu** trên endpoint nhạy cảm (login, OTP, upload) → báo, gợi ý thêm middleware.
- **Auth middleware bị bỏ qua**: route admin/private không có guard → báo ngay.
- **Zod schema không trim string**: field text từ client nên `.trim()` để tránh whitespace tạo bản ghi trùng.

---

## 4. Error handling

- Controller luôn có try/catch (hoặc async wrapper) — không để unhandled promise rejection.
- Service **không** tự trả HTTP response, chỉ throw lỗi có type rõ ràng (custom error class hoặc object `{ code, message }`).
- `Promise.allSettled` cho batch task độc lập — log lỗi từng phần, không để 1 task chết kéo sập toàn bộ.
- Lỗi Prisma: phân biệt `P2025` (not found), `P2002` (unique constraint) — map sang HTTP status phù hợp, không trả 500 cho lỗi nghiệp vụ.

---

## 5. Comment style

- Không dùng khối `// ─────...─────`. Dùng `// TÊN NHÓM` một dòng, ngắn gọn.
- Comment giải thích "tại sao" (lý do nghiệp vụ/kỹ thuật) thì giữ.
- Comment mô tả lại điều code đã tự nói rõ thì bỏ.

---

## 6. Checklist scan từng file

1. Import có bị trùng/lệch namespace không?
2. Có code chết (hàm/biến không còn ai gọi) không?
3. Có `as any` / cast thừa khi type Prisma select đã đủ không?
4. Validate/parse bị lặp 2 lớp (middleware + controller) không?
5. Logic cascade/utility có đang nằm sai layer không?
6. Có N+1 query không? (loop + query bên trong)
7. Có `findMany` thiếu `take`/`skip` hoặc thiếu `select` không?
8. Có `await` trong vòng lặp khi task độc lập → nên `Promise.all` không?
9. Có `$queryRaw` nối string trực tiếp không?
10. Endpoint nhạy cảm có thiếu rate limit / auth guard không?
11. Error có lộ stack trace ra client không?
12. Comment có đồng nhất với file khác trong module không?

---

## 7. Quy trình làm việc

- Scan toàn bộ, **báo cáo danh sách vấn đề trước** — chia nhóm: "cần sửa ngay", "đề xuất cải thiện", "hỏi xác nhận".
- Sửa từng file một theo xác nhận, không batch âm thầm.
- Sau khi sửa: gửi full file qua `present_files`, tóm tắt thay đổi ngắn (không lặp lại toàn bộ diff bằng lời).
- Nếu phát hiện bug thật (sai import path, type không khớp, P2002 không được handle): nêu rõ, hỏi xác nhận.
