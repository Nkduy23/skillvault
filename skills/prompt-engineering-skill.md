# Prompt Engineering Skill — Làm việc hiệu quả với AI

Dùng mỗi khi nhờ AI (Claude, ChatGPT, Cursor...) giúp code. Prompt tốt = ít vòng lặp, output đúng ngay lần đầu, không phải sửa đi sửa lại.

---

## 1. Nguyên tắc cốt lõi

- **Context đủ = output tốt.** AI không biết codebase của bạn — phải cung cấp đủ context liên quan.
- **Yêu cầu cụ thể = kết quả cụ thể.** "Giúp tôi code API" → output mơ hồ. "Viết Prisma query lấy top 10 order theo tổng tiền, filter theo userId, có pagination" → output đúng.
- **1 prompt = 1 task.** Không nhồi nhiều yêu cầu không liên quan vào 1 prompt.
- **Xác nhận trước, code sau.** Với task phức tạp: hỏi AI liệt kê plan → bạn xác nhận → AI code. Tránh AI code sai hướng cả 100 dòng.

---

## 2. Template prompt theo loại task

### Code feature mới

```
Context:
- Stack: Next.js 14 App Router, Express, Prisma, PostgreSQL, Zod
- File liên quan: [paste schema Prisma / type / interface hiện tại]
- Convention: [paste 1 file tương tự đã có để AI follow pattern]

Yêu cầu:
[Mô tả rõ feature, input, output, edge case cần handle]

Constraint:
- Không thêm package mới trừ khi thật sự cần, báo trước nếu cần
- Follow đúng pattern file tôi đã paste
- Liệt kê file cần tạo/sửa trước, tôi xác nhận rồi mới code
```

### Review / clean code

```
Hãy review file này theo checklist:
[paste nội dung skill Clean FE hoặc Clean BE]

File cần review:
[paste code]

Báo cáo vấn đề theo 3 nhóm:
1. Cần sửa ngay (bug, security, crash risk)
2. Nên cải thiện (performance, readability)
3. Gợi ý (optional, trade-off rõ ràng)

Không tự sửa — chỉ báo cáo trước, tôi xác nhận từng mục rồi mình làm tiếp.
```

### Debug

```
[Dùng template từ Debug Skill — Frame 4 mục: Expected/Actual/When/Changed]

Đã kiểm tra:
- [những gì đã loại trừ]

File liên quan:
[paste file hoặc đoạn code nghi ngờ]

Error message đầy đủ:
[paste stack trace]
```

### Refactor

```
Tôi muốn refactor đoạn code này với mục tiêu: [tách component / giảm re-render / tách layer...]

Code hiện tại:
[paste code]

Constraint:
- Không thay đổi behavior — chỉ cấu trúc lại
- Giữ nguyên interface public (API/props không đổi)
- Giải thích lý do từng thay đổi lớn
```

### Viết test

```
Viết test cho function/component này:

[paste code cần test]

Yêu cầu:
- Test framework: Jest + [React Testing Library / Supertest]
- Cover: happy path, error path, edge case [liệt kê cụ thể]
- Không mock implementation detail — chỉ mock boundary (API call, DB)
- Tên test theo pattern: describe('[tên]') → it('[behavior]')
```

---

## 3. Cung cấp context hiệu quả

**Luôn cung cấp:**

- Tech stack + version (đặc biệt khi có breaking change giữa version).
- 1 file example tương tự đã có — để AI follow pattern, không phát minh lại convention.
- Prisma schema liên quan nếu task có DB.
- Type/interface liên quan nếu task có TypeScript.

**Cung cấp khi cần:**

- File structure (copy output của `tree -L 3`) khi task liên quan đến tạo file mới.
- Error message đầy đủ khi debug.
- API contract khi viết code cả FE lẫn BE.

**Không cần cung cấp:**

- Toàn bộ codebase — chỉ file liên quan trực tiếp.
- File config không liên quan (webpack, tailwind...) trừ khi task liên quan.
- Lịch sử conversation quá dài — mở conversation mới khi sang task khác.

---

## 4. Kiểm soát output của AI

**Yêu cầu AI liệt kê plan trước:**

```
Trước khi code, hãy liệt kê:
1. File nào sẽ tạo mới / sửa
2. Thay đổi logic chính ở đâu
3. Dependency mới nào cần thêm (nếu có)
Tôi sẽ xác nhận rồi mình code.
```

**Giới hạn scope:**

```
Chỉ sửa file order.service.ts — không sửa file khác trong lần này.
```

**Yêu cầu giải thích:**

```
Giải thích ngắn lý do cho mỗi thay đổi quan trọng — không cần giải thích từng dòng.
```

**Khi output dài:**

```
Code từng file một, gửi xong file 1 rồi dừng, tôi xác nhận trước khi làm file 2.
```

---

## 5. Phân loại task theo độ phức tạp

**Task nhỏ (< 50 dòng, 1 file) — prompt ngắn gọn:**

```
Viết Zod schema validate body: { email: string, age: number (>= 18), role: 'USER' | 'ADMIN' }
```

**Task trung bình (1-3 file) — cung cấp context + convention:**

```
[Context stack + file example] → [Yêu cầu cụ thể] → [Constraint]
```

**Task lớn (> 3 file, feature phức tạp) — luôn plan trước:**

```
[Context đầy đủ] → Liệt kê plan → Xác nhận → Code từng file → Review từng file
```

Không để AI code liền 5 file một lúc mà không review — sai 1 chỗ thì sai dây chuyền.

---

## 6. Dấu hiệu prompt cần cải thiện

- AI hỏi lại quá nhiều → context không đủ.
- Output không follow convention → thiếu file example.
- AI code sai tech stack → không specify rõ version/framework.
- Output quá generic → yêu cầu quá mơ hồ.
- AI tự thêm package không cần → không có constraint.
- Phải sửa output nhiều lần → task quá lớn, cần tách nhỏ.

---

## 7. Workflow tối ưu khi dùng AI hàng ngày

```
1. Task mới → mở conversation mới (không kéo dài conversation cũ)
2. Paste context: stack + file example + schema/type liên quan
3. Describe task cụ thể + constraint
4. Với task lớn: yêu cầu plan → xác nhận → code từng file
5. Review output trước khi apply (đừng copy-paste blindly)
6. Nếu sai → cung cấp error cụ thể, không chỉ nói "sai rồi"
7. Sau khi xong: chạy Clean Skill để review trước khi commit
```

---

## 8. Prompt anti-pattern — tránh

```
❌ "Giúp tôi code cái này" (không đủ context)
❌ "Sửa lỗi cho tôi" (không paste error)
❌ "Làm cho nó tốt hơn" (không rõ tiêu chí)
❌ "Code toàn bộ module order cho tôi" (quá lớn, không kiểm soát được)
❌ "Tại sao code không chạy?" (không paste code, không paste lỗi)
❌ "Làm lại đi, vẫn sai" (không nói sai ở đâu, sai như thế nào)
```
