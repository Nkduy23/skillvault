# Clean FE Skill — Next.js / React

Dùng khi được yêu cầu "clean module FE này". Scan toàn bộ file trong scope, áp dụng các quy ước dưới đây theo thứ tự. Không hỏi lại trừ khi phát hiện bug logic thật sự hoặc cần xác nhận hướng refactor lớn.

---

## 1. Nghiêm cấm `any` — luôn tìm type chính xác

- **Không** dùng `as any`, `any[]`, `Record<string, any>`, `(e: any)` trong bất kỳ hoàn cảnh nào.
- Thay thế theo thứ tự ưu tiên:
  - Dùng type/interface đã có trong codebase (search trước khi định nghĩa mới).
  - Dùng `unknown` + type guard nếu thật sự không biết shape.
  - Dùng generic `<T>` nếu hàm cần linh hoạt.
  - Nếu type từ thư viện thiếu → extend hoặc `Omit`/`Pick` từ type gốc, không cast.
- Khi phát hiện `any`: báo rõ vị trí, đề xuất type thay thế, hỏi xác nhận trước khi sửa nếu type phức tạp.

---

## 2. Error handling — propagate, không nuốt lỗi trong lib

- Hàm gọi API trong `lib/api/*.ts` / `services/*.ts` **không** try/catch — để lỗi bay lên component/hook gọi.
- Component/hook **phải** tự try/catch và luôn reset loading state trong `finally`.
- `Promise.all` gộp nhiều API độc lập → đổi sang `Promise.allSettled`, log lỗi riêng từng phần, fallback đúng shape/type cho phần lỗi.
- Có `AbortSignal` (debounced search...): phân biệt `AbortError` với lỗi thật, không hiển thị "không có kết quả" khi thực ra là bị cancel.

---

## 3. Tách file và cấu trúc component

- **Nguyên tắc 1 file = 1 concern**: component > 200 dòng, hoặc có nhiều hơn 2 "vùng UI" độc lập → đề xuất tách.
- Khi tách: hướng dẫn tên file, path, cách import, không tự tách âm thầm — luôn hỏi xác nhận trước.
- Gợi ý tách theo pattern:
  - `ui/` — presentational component (nhận props, không gọi API).
  - `containers/` hoặc cùng file page — logic fetch + state management.
  - `hooks/` — custom hook tái sử dụng logic.
  - `utils/` — hàm thuần, không side effect.
- Nếu component có quá nhiều `useState` liên quan nhau → gợi ý `useReducer` hoặc tách sang custom hook.

---

## 4. Re-render — phát hiện và tối ưu

Scan tích cực các nguy cơ re-render không cần thiết:

- **Object/array literal làm prop/dependency**: `<Comp style={{ color: 'red' }} />` tạo object mới mỗi render → gợi ý `useMemo` hoặc define ngoài component.
- **Inline function làm prop**: `<Comp onClick={() => doSomething(id)} />` trong list lớn → gợi ý `useCallback`.
- **Component nặng không được memo hoá**: list item render phức tạp, chart, editor → gợi ý `React.memo`, chỉ rõ dependency.
- **Context làm re-render toàn cây**: nếu context value thay đổi thường xuyên và nhiều component subscribe → gợi ý tách context hoặc dùng selector pattern (zustand/jotai).
- **useEffect dependency không đầy đủ hoặc thừa**: báo rõ, đề xuất sửa, không tự sửa nếu logic phức tạp.
- Luôn hỏi xác nhận trước khi thêm `memo`/`useCallback`/`useMemo` — tránh over-optimise khi component nhẹ.

---

## 5. Nguy cơ crash và code không an toàn

Báo ngay (không tự sửa, hỏi xác nhận) khi phát hiện:

- **Optional chaining thiếu**: `data.user.name` mà `user` có thể `undefined/null` → thêm `?.`.
- **Array method không kiểm tra tồn tại**: `.map()`, `.filter()` trên giá trị có thể `undefined` → thêm `?? []` hoặc early return.
- **Async không được await**: fire-and-forget vô tình trong event handler → báo rõ ý định, nếu cố ý thì comment lý do.
- **Race condition**: fetch trong useEffect không có cleanup / cancel → đề xuất AbortController hoặc flag `isMounted`.
- **Unhandled promise rejection**: `.then()` không có `.catch()` và không được await → báo.
- **Key không ổn định trong list**: `key={index}` trên list có thể reorder/xoá/thêm → gợi ý dùng ID thật.
- **Mutation state trực tiếp**: `state.items.push(...)` thay vì `[...state.items, ...]` → báo ngay.

---

## 6. Performance — phát hiện sớm

- **N+1 render**: component cha render → mỗi item con lại fetch riêng → gợi ý batch/lift fetch lên cha.
- **Fetch trong loop**: `for (const id of ids) await fetch(id)` → gợi ý `Promise.all` hoặc batch API.
- **Heavy computation không cache**: tính toán phức tạp trong render body không có `useMemo` → báo, ước lượng tần suất chạy.
- **Import quá nặng không lazy**: component/lib lớn (chart, editor, PDF viewer...) import trực tiếp → gợi ý `dynamic import` / `React.lazy`.
- **Image không tối ưu** (Next.js): dùng `<img>` thay `<Image>`, thiếu `width/height`, thiếu `priority` cho above-the-fold → báo.
- **useEffect không cần thiết**: dùng useEffect để sync state từ prop (có thể tính trực tiếp trong render) → báo và đề xuất bỏ.

---

## 7. Type safety nâng cao

- Không dùng type assertion `as X` khi có thể validate bằng Zod/type guard thật.
- API response nên có Zod schema validate ở tầng `lib/api` — nếu chưa có, đề xuất thêm, không bắt buộc ngay.
- Enum từ backend nên được định nghĩa là `const` object + `type` infer (không dùng `enum` keyword của TS — tránh JS artifact).
- Props interface: không dùng `React.FC<Props>` (ẩn `children` type) — dùng function thường với `props: Props`.

---

## 8. Comment style

- Không dùng khối `// ─────...─────`. Dùng `// TÊN NHÓM` một dòng, ngắn gọn.
- Comment giải thích "tại sao" (lý do nghiệp vụ/kỹ thuật) thì giữ.
- Comment mô tả lại điều code đã tự nói rõ thì bỏ.

---

## 9. Checklist scan từng file

1. Có `any` / `as any` / `Record<string, any>` không? → fix hoặc báo.
2. Error handler có `finally` reset loading không?
3. Component > 200 dòng hoặc > 2 vùng UI → đề xuất tách.
4. Có inline object/array/function làm prop của component render nhiều lần không?
5. Có `?.` còn thiếu ở chỗ dữ liệu từ API/props không?
6. Có fetch/Promise không có error handler hoặc race condition không?
7. Có `key={index}` trong list động không?
8. Có import nặng không lazy không? (Next.js: chart, editor, PDF...)
9. Có `useEffect` sync state từ prop (có thể bỏ) không?
10. Comment có đồng nhất với file khác trong cùng module không?

---

## 10. Quy trình làm việc

- Scan toàn bộ, **báo cáo danh sách vấn đề trước** — chia nhóm: "cần sửa ngay", "đề xuất cải thiện", "hỏi xác nhận".
- Sửa từng file một theo xác nhận, không batch âm thầm.
- Sau khi sửa: gửi full file qua `present_files`, tóm tắt thay đổi ngắn (không lặp lại toàn bộ diff bằng lời).
- Nếu phát hiện bug thật (sai import path, type không khớp, logic sai): nêu rõ, hỏi xác nhận thay vì tự đoán.
