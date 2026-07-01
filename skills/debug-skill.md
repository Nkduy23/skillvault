# Debug Skill — Quy trình debug có hệ thống

Dùng khi có bug / unexpected behavior. Thay vì đoán mò hoặc đưa toàn bộ code cho AI và hỏi "sao lỗi", hãy chạy qua quy trình này trước. Cung cấp đúng thông tin → AI (hoặc bản thân) tìm ra nguyên nhân nhanh hơn nhiều.

---

## 1. Frame vấn đề trước khi làm gì khác

Điền đủ 4 mục này — nếu không điền được đủ, vấn đề chưa được hiểu đúng:

```
EXPECTED : [mô tả điều bạn nghĩ sẽ xảy ra]
ACTUAL   : [mô tả chính xác điều đang xảy ra — copy error message nguyên văn]
WHEN     : [bước nào trigger? lúc nào xuất hiện? có reproduce được không?]
CHANGED  : [gần đây thay đổi gì? deploy gì? merge gì?]
```

**Reproduce được = 80% đường đến giải pháp.** Nếu bug không reproduce được → đó là một loại bug khác (intermittent), cần log trước, debug sau.

---

## 2. Đọc error đúng cách trước khi hỏi AI

### Runtime error
- Copy **toàn bộ stack trace**, không tóm tắt.
- Chú ý dòng **đầu tiên trong code của bạn** xuất hiện trong stack (không phải dòng trong `node_modules`).
- Error message thường nói đúng vấn đề — đọc kỹ trước khi bỏ qua.

### Prisma error
| Code | Nghĩa | Hướng check |
|------|-------|-------------|
| P2002 | Unique constraint fail | Field nào unique? Dữ liệu đang insert trùng gì? |
| P2025 | Record not found | ID có tồn tại không? Có bị soft delete không? |
| P2003 | Foreign key constraint | Relate record có tồn tại không? |
| P2014 | Relation violation | Xoá record đang được reference ở chỗ khác |
| P1001 | DB không kết nối được | Connection string, firewall, DB có đang chạy không? |

### Next.js / React error
- `Hydration mismatch`: server render ≠ client render — thường do dùng `Date.now()`, `Math.random()`, hoặc data từ localStorage ở tầng server.
- `Cannot read properties of undefined`: optional chaining thiếu, hoặc data fetch chưa xong mà đã render.
- `Maximum update depth exceeded`: `setState` trong `useEffect` không có dependency hoặc dependency sai gây vòng lặp.
- `NEXT_REDIRECT` / `NEXT_NOT_FOUND` bị catch: không dùng try/catch bọc `redirect()`/`notFound()` trong Next.js App Router.

---

## 3. Checklist debug theo tầng — đi từ ngoài vào trong

### Tầng 1: Network (trước khi nhìn code)
- [ ] Mở DevTools → Network tab → xem request có được gửi không?
- [ ] Status code là gì? (4xx = lỗi client/input, 5xx = lỗi server)
- [ ] Request payload có đúng không? (sai field name, thiếu field, sai type)
- [ ] Response body chứa gì? (đọc kỹ, đừng chỉ nhìn status)
- [ ] Header có đủ không? (Authorization, Content-Type)

### Tầng 2: Validation (Zod / middleware)
- [ ] Zod schema có match với data thật đang gửi lên không?
- [ ] Query string: có dùng `z.coerce` cho số/boolean không?
- [ ] Body có bị parse sai (multipart vs JSON) không?
- [ ] Middleware validate có đang chạy trước controller không?

### Tầng 3: Business logic (service)
- [ ] Log input vào service — data có đúng shape không?
- [ ] Điều kiện if/else có cover đúng case đang xảy ra không?
- [ ] Có hàm nào return sớm (early return) mà bạn không để ý không?
- [ ] Async/await có đủ không? (bỏ `await` = không chờ kết quả)

### Tầng 4: Database (Prisma / query)
- [ ] Bật Prisma query log để xem SQL thật đang chạy:
  ```ts
  const prisma = new PrismaClient({ log: ['query', 'warn', 'error'] })
  ```
- [ ] Query có trả về `null` không? (findFirst/findUnique khi không tìm thấy)
- [ ] `where` clause có đúng không? Có filter thừa/thiếu không?
- [ ] Có transaction nào đang block không?
- [ ] Migration có được chạy chưa? Schema code có khớp DB thật không?

### Tầng 5: FE state
- [ ] Mở React DevTools → xem state/props của component đang sai.
- [ ] `console.log` tại điểm đầu vào của component — data có đúng không?
- [ ] useEffect có chạy đúng số lần không? (Strict Mode chạy 2 lần — đây là bình thường)
- [ ] Có stale closure không? (state cũ bị capture trong callback/useEffect)

---

## 4. Cô lập bug — thu nhỏ scope

Nếu chưa tìm ra sau tầng trên:

1. **Comment dần** — tắt từng phần cho đến khi bug biến mất → phần vừa tắt là thủ phạm.
2. **Hardcode input** — thay variable bằng giá trị cố định → nếu hết lỗi thì bug nằm ở data, không phải logic.
3. **Tách ra file test riêng** — copy hàm nghi ngờ ra môi trường sạch, chạy độc lập.
4. **Rollback từng bước** — nếu bug xuất hiện sau thay đổi gần đây, `git bisect` hoặc revert từng commit.

---

## 5. Cung cấp đúng context khi nhờ AI debug

Đừng paste toàn bộ codebase. Cung cấp theo thứ tự:

```
1. FRAME (4 mục ở mục 1)
2. Error message đầy đủ + stack trace
3. File liên quan trực tiếp đến lỗi (không phải toàn bộ module)
4. Kết quả đã kiểm tra (đã qua tầng nào, loại trừ được gì)
5. Tech stack + version nếu liên quan đến compatibility
```

Nói rõ: "Mình đã kiểm tra X, Y, Z — chỉ còn nghi ngờ ở chỗ này." AI sẽ không lặp lại những gì bạn đã loại trừ.

---

## 6. Intermittent bug — lỗi không reproduce được

Khó nhất — cần log trước, debug sau:

- Thêm **structured log** tại các điểm nghi ngờ: log input, output, timestamp, user/request ID.
- Log phải có **correlation ID** để trace 1 request xuyên suốt các service/function.
- Không log `console.log(obj)` raw trong production — dùng logger có level (`info`, `warn`, `error`).
- Các nguyên nhân phổ biến của intermittent bug:
  - Race condition (2 async task cùng write 1 resource)
  - Memory leak (state tích lũy theo thời gian)
  - External service flaky (DB timeout, API rate limit)
  - Time-dependent logic (timezone, DST, midnight edge case)
  - Cache stale (đọc data cũ, không phải bug logic)

---

## 7. Sau khi tìm ra bug — đừng chỉ fix

- **Root cause**: fix triệu chứng hay gốc rễ? Nếu chỉ fix triệu chứng → bug sẽ quay lại dưới dạng khác.
- **Lan rộng**: bug pattern này có xuất hiện ở chỗ nào khác trong codebase không? Search và fix luôn.
- **Prevent**: thêm validation, type guard, hoặc test để lỗi này không tái diễn.
- **Note lại**: nếu bug phức tạp → comment ngắn giải thích "tại sao fix theo cách này" ngay tại code.
