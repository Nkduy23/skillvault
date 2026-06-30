# Skill Vault

Web tĩnh (HTML/CSS/JS thuần, không build tool) để lưu các file skill `.md` và copy lại khi cần.

## Cấu trúc

```
skill-vault/
├── index.html
├── style.css
├── script.js
└── skills/
    ├── manifest.json      ← danh sách skill đọc từ file
    └── clean-module-skill.md
```

## Cách thêm skill bằng file (khuyến nghị, bền khi deploy lại)

1. Bỏ file `.md` mới vào folder `skills/`.
2. Mở `skills/manifest.json`, thêm 1 object:
   ```json
   { "file": "ten-file.md", "title": "Tên hiển thị", "desc": "Mô tả ngắn", "tags": ["tag1", "tag2"] }
   ```
3. Deploy lại (hoặc refresh nếu chạy local server) — skill sẽ tự xuất hiện trên trang, đánh dấu "chỉ đọc".

## Cách thêm skill nhanh bằng UI (lưu local trong trình duyệt)

Bấm nút **Thêm skill** trên web, dán nội dung trực tiếp. Skill này lưu vào `localStorage` của trình duyệt — tiện cho việc thêm nhanh khi đang dùng, nhưng sẽ **không có sẵn trên trình duyệt/máy khác** trừ khi bạn xuất backup.

- **Xuất backup (.json)**: tải toàn bộ skill đã thêm qua UI thành 1 file, để lưu trữ hoặc chuyển sang máy khác.
- **Nhập backup**: nạp lại file backup đó vào trình duyệt hiện tại.

## Chạy thử local

Vì trang dùng `fetch()` để đọc `skills/manifest.json`, mở trực tiếp bằng `file://` sẽ bị chặn CORS ở một số trình duyệt. Chạy 1 local server đơn giản:

```bash
cd skill-vault
python3 -m http.server 8080
# rồi mở http://localhost:8080
```

## Deploy

Đây là static site thuần — deploy được lên bất kỳ static host nào: Vercel, Netlify, GitHub Pages, Cloudflare Pages... chỉ cần upload nguyên folder `skill-vault/`.
