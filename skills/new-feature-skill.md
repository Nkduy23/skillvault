# New Feature Skill — Blueprint trước khi code

Dùng khi bắt đầu một feature mới. Chạy qua checklist này **trước khi viết dòng code đầu tiên**. Mục tiêu: không phải clean nhiều sau, không phải refactor giữa chừng, không miss edge case quan trọng.

---

## 1. Frame rõ feature trước

Trước khi làm bất cứ thứ gì, trả lời đủ 4 câu này:

- **What**: feature này làm chính xác cái gì? (1-2 câu, không dùng từ mơ hồ như "quản lý", "xử lý")
- **Who**: ai dùng? (user role nào, có phân quyền không?)
- **Boundary**: feature này bắt đầu từ đâu, kết thúc ở đâu? (không scope creep)
- **Done means**: thế nào là xong? (acceptance criteria rõ ràng, testable)

Nếu không trả lời được đủ 4 câu → **dừng lại, làm rõ trước** — đừng code "rồi tính sau".

---

## 2. Thiết kế API contract (BE + FE đồng thuận trước)

Xác định trước khi code cả 2 đầu:

```
Method + Path   : POST /api/v1/orders
Auth            : Bearer token, role: user
Request body    : { productId: string, quantity: number, note?: string }
Success response: 201 { id, status, createdAt }
Error cases     :
  - 400 validation fail (Zod)
  - 404 product not found
  - 409 out of stock
  - 500 unexpected
```

- Đặt tên field nhất quán với các API đã có (camelCase, đừng mix `user_id` và `userId`).
- Nếu response có list → luôn có pagination ngay từ đầu, đừng "thêm sau".
- Nếu có file upload → xác định format, max size, storage destination trước.

---

## 3. Data model — nghĩ kỹ trước khi migrate

- Vẽ (hoặc mô tả text) relation giữa các entity liên quan.
- Hỏi trước:
  - Field nào cần **index**? (filter, sort, foreign key join thường xuyên)
  - Có cần **soft delete** không? (`deletedAt` thay vì xoá thật)
  - Field nào **nullable** thật sự? Không để nullable mặc định cho tiện.
  - Có field nào sẽ **grow unbounded** không? (array, JSON blob, log — cần strategy)
  - Tên bảng/field có nhất quán với schema hiện tại không?
- Migration naming: `[timestamp]_[verb]_[subject]` — vd: `20240601_add_note_to_orders`.
- Không migration "vá" liên tục — thiết kế đúng từ đầu hoặc gộp thành 1 migration rõ ý định.

---

## 4. File structure — tạo đúng chỗ ngay từ đầu

**BE (Express/NestJS)** — tạo đủ các file trước khi code:
```
modules/[feature]/
  [feature].route.ts
  [feature].controller.ts
  [feature].service.ts
  [feature].repository.ts
  [feature].validation.ts
  [feature].helpers.ts     ← chỉ tạo nếu cần
```

**FE (Next.js/React)** — xác định trước:
```
app/[route]/
  page.tsx                 ← container, fetch data
  _components/
    FeatureForm.tsx        ← presentational
    FeatureList.tsx
  _hooks/
    useFeatureData.ts      ← logic tái sử dụng
  _utils/
    featureHelpers.ts      ← hàm thuần
```

- Không để logic fetch lẫn vào presentational component ngay từ đầu.
- Không tạo file `utils.ts` chung cho nhiều feature — đặt đúng trong folder feature.

---

## 5. Edge case — nghĩ trước khi code

Với mỗi feature, bắt buộc đi qua các nhóm này:

**Data:**
- [ ] Input rỗng / null / undefined
- [ ] String quá dài, số âm, số cực lớn
- [ ] List rỗng vs list chưa load
- [ ] Dữ liệu từ DB bị null unexpected (schema thay đổi không migrate đủ)

**State / timing:**
- [ ] User submit 2 lần liên tiếp (double submit)
- [ ] Request chậm — UI có loading state chưa?
- [ ] Request fail — UI có error state chưa? Có retry không?
- [ ] User navigate đi trong khi đang fetch

**Phân quyền:**
- [ ] User không có quyền gọi API này — FE có guard không?
- [ ] Token hết hạn giữa chừng — có handle 401 không?

**Concurrency:**
- [ ] 2 user cùng edit 1 record — có conflict không?
- [ ] Race condition nếu async task chạy song song

---

## 6. Dependency check trước khi bắt đầu

- Có cần thêm package mới không? Nếu có: kiểm tra bundle size (FE), license, last maintained.
- Feature này phụ thuộc feature nào chưa xong? Unblock trước.
- Có breaking change với API/schema đang dùng ở chỗ khác không? Map ra trước.
- Nếu cần seed data để test: viết seed script ngay, đừng insert tay rồi quên.

---

## 7. Định nghĩa "không làm" (out of scope)

Liệt kê rõ những thứ **sẽ không có** trong lần này:
> "Feature này chỉ làm CRUD cơ bản. Chưa có: export Excel, bulk action, real-time update, audit log."

Tránh scope creep trong khi code. Nếu muốn thêm → tạo task riêng.

---

## 8. Quy trình khi nhờ AI code feature mới

1. Cung cấp đủ: tech stack, file structure hiện tại, API contract đã thống nhất, Prisma schema liên quan.
2. Yêu cầu AI **liệt kê file sẽ tạo/sửa trước** — xác nhận trước khi AI code.
3. Code từng file một, theo thứ tự: validation → repository → service → controller → route (BE), hoặc type → api → hook → component (FE).
4. Không để AI tự thêm dependency mới mà không báo.
5. Sau khi xong: chạy lại Clean FE / Clean BE Skill để review trước khi merge.
