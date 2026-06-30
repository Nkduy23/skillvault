# Clean Module Skill

Dùng khi được yêu cầu "clean module này" (BE Express/NestJS hoặc FE Next.js/React). Áp dụng các quy ước dưới đây, không cần hỏi lại trừ khi phát hiện bug logic thật sự.

## 1. Error handling (FE) — Hướng B: propagate, không nuốt lỗi trong lib

- Các hàm gọi API trong `lib/api/*.ts` KHÔNG try/catch — để lỗi bay tự nhiên lên component gọi.
- Component/hook gọi các hàm này PHẢI tự try/catch (hoặc `.catch()`), và luôn reset loading state trong `finally`.
- Với `Promise.all` gộp nhiều API độc lập (ví dụ trang chủ nhiều block dữ liệu): đổi sang `Promise.allSettled`, log lỗi riêng từng phần, fallback default đúng shape/type cho phần lỗi — không để 1 API chết kéo sập cả response.
- Request có `AbortSignal` (debounced search...): không nuốt `AbortError`, phải phân biệt với lỗi thật để tránh hiểu nhầm "không có kết quả" thành do bị cancel.

## 2. Backend layering (Express + Zod + Prisma)

- **route.ts**: import `* as controller from "./x.controller"`, `* as validator from "./x.validation"`. Validate (`validate(schema, "query"|"params"|"body")`) chạy ở middleware route — đây là layer DUY NHẤT chịu trách nhiệm validate cho query/params. Field nhóm theo block (Public/Admin/...) với comment 1 dòng.
- **controller.ts**: import `* as categoryService from "./x.service"` (namespace nhất quán, không import lẻ trùng). KHÔNG `.parse()` lại query/params đã được middleware validate — chỉ cast type bằng `req.query as unknown as z.infer<typeof schema>`. Body multipart (kèm file upload) là ngoại lệ: validate ở controller sau khi `parseMultipartData`, vì middleware không xử lý được multipart JSON string.
- **service.ts**: import `* as repo`, `* as helpers`. Không cast `as any` nếu type Prisma select đã có field đó — kiểm tra lại `select` trước khi cast. Logic cascade/transaction thuần DB (không phải orchestration nghiệp vụ) → dời sang `helpers.ts`. Xóa dead code (hàm không còn ai gọi) ngay khi phát hiện, không giữ "phòng khi cần".
- **repository.ts**: chỉ chứa Prisma query thuần. Giữ nguyên nếu đã có `select` rõ ràng, comment nhóm ngắn (`// FINDS`, `// MUTATIONS`, `// HELPERS / CHECKS`).
- **helpers.ts**: utility thuần (upload ảnh, parse multipart, cascade DB). Luôn check import path đúng alias dự án (so sánh với các file khác trong cùng module) — path lạ/không nhất quán là dấu hiệu bug.
- **validation.ts**: Zod schema. Query string → `z.coerce.number()`/`booleanQuery` transform. JSON body → `z.number()`/`z.boolean()` thuần. Export type bằng `z.infer<typeof schema>`, không định nghĩa tay trùng lặp.

## 3. Comment style (áp dụng cả FE/BE)

- Không dùng khối `// ─────...─────`. Dùng `// TÊN NHÓM` một dòng, ngắn gọn.
- Comment giải thích "tại sao" (lý do nghiệp vụ/kỹ thuật) thì giữ, comment mô tả lại điều code đã tự nói rõ thì bỏ.

## 4. Checklist khi review từng file

1. Import có bị trùng/lệch namespace không (cùng 1 module import 2 kiểu khác nhau)?
2. Có code chết (hàm/biến không còn ai gọi) không? Nếu có, xóa hoặc hỏi xác nhận nếu nghi ngờ dùng ở module khác.
3. Có `as any`/cast thừa do không tin tưởng type, trong khi type gốc (Prisma select, Zod infer) đã đủ thông tin không?
4. Có validate/parse bị lặp 2 lớp (middleware + controller, hoặc FE check 2 nơi) không?
5. Logic cascade/utility thuần có đang nằm sai layer (vd: nằm trong service thay vì helpers) không?
6. Format comment có đồng nhất với các file khác cùng module không?

## 5. Quy trình làm việc

- Sửa từng file một, luôn hỏi xác nhận hướng đi lớn (vd: hướng A vs B) trước khi áp dụng đồng loạt, trừ khi đã chốt từ trước trong cùng phiên.
- Sau khi sửa, gửi full file qua `present_files`, tóm tắt ngắn gọn các thay đổi chính (không lặp lại toàn bộ diff bằng lời).
- Nếu phát hiện bug thật (sai import path, type không khớp...), nêu rõ và hỏi xác nhận thay vì tự ý đoán rồi sửa âm thầm.
