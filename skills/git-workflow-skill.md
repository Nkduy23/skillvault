# Git Workflow Skill — Branch, Commit, PR, Review

Dùng khi setup workflow hoặc review git practice của team. Git discipline tốt = ít conflict, rollback dễ, history đọc được.

---

## 1. Branch strategy

**Nhánh chính:**

```
main        ← production, luôn deployable
develop     ← integration (nếu dùng Gitflow)
```

**Nhánh làm việc — đặt tên theo pattern:**

```
feat/[ticket-id]-short-description
fix/[ticket-id]-short-description
chore/update-dependencies
refactor/order-service-cleanup
hotfix/payment-null-crash
```

**Nguyên tắc:**

- 1 branch = 1 task/ticket — không gộp nhiều feature vào 1 branch.
- Branch sống ngắn: tạo → code → merge → xoá. Không để branch sống > 1 tuần nếu không có lý do.
- Không commit thẳng vào `main`/`develop` — luôn qua PR.
- Không merge `main` vào feature branch liên tục — dùng `rebase` để giữ history tuyến tính.

---

## 2. Commit message — Conventional Commits

**Format:**

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

**Type chuẩn:**

```
feat     → tính năng mới
fix      → sửa bug
chore    → task không ảnh hưởng logic (update dep, config)
refactor → refactor, không thêm feature, không sửa bug
style    → format, whitespace (không đổi logic)
test     → thêm/sửa test
docs     → tài liệu
perf     → cải thiện performance
ci       → thay đổi CI/CD
```

**Ví dụ:**

```
feat(order): add cancel order endpoint

Implements POST /orders/:id/cancel
- validates order status must be PENDING
- sends cancellation email via queue

Closes #123
```

```
fix(auth): refresh token not invalidated on logout

The refresh token was only deleted from cookie but not from DB,
allowing reuse after logout.
```

**Nguyên tắc:**

- Subject: viết theo imperative mood — "add", "fix", "update", không phải "added", "fixed".
- Subject: không quá 72 ký tự.
- Subject: không dùng dấu chấm cuối.
- Body: giải thích "tại sao" và "gì thay đổi", không phải "tôi đã làm gì".
- Mỗi commit là 1 unit có thể revert độc lập — không commit "WIP" lên branch chính.

---

## 3. Commit hygiene

**Trước khi commit:**

```bash
git diff --staged   # review những gì sẽ commit
git status          # không commit file thừa (env, build artifact)
```

**File không được commit — kiểm tra `.gitignore`:**

```
.env
.env.local
.env.*.local
node_modules/
dist/
build/
.next/
*.log
.DS_Store
```

**Atomic commit — mỗi commit compile được, test pass:**

- Không để commit "half-done" trên branch shared.
- Dùng `git stash` hoặc `git commit --amend` để squash WIP trước khi push.
- Nếu đã push WIP → squash trước khi mở PR: `git rebase -i HEAD~n`.

---

## 4. Pull Request

**Trước khi mở PR:**

- [ ] Self-review diff lần cuối — đọc như reviewer.
- [ ] Xoá `console.log`, `TODO` chưa có ticket, code comment thừa.
- [ ] Test pass local.
- [ ] Không có conflict với target branch.
- [ ] Commit history gọn — squash WIP commit nếu cần.

**PR description template:**

```markdown
## Thay đổi gì

<!-- Mô tả ngắn 2-3 câu -->

## Lý do / Ticket

<!-- Link ticket, context nghiệp vụ -->

## Cách test

<!-- Bước reproduce, test case, hoặc screenshot -->

## Checklist

- [ ] Test đã chạy
- [ ] Không có breaking change
- [ ] Migration đã chạy (nếu có)
- [ ] Env var mới đã document
```

**PR size:**

- Lý tưởng: < 400 dòng thay đổi.
- PR lớn → tách thành nhiều PR nhỏ, stack PR nếu cần.
- Reviewer không thể review tốt PR > 1000 dòng — thừa nhận và tách.

---

## 5. Code review — cả 2 phía

**Người mở PR:**

- Không defensive khi nhận feedback — default là "cảm ơn, mình sẽ check".
- Nếu không đồng ý → giải thích lý do, không im lặng merge.
- Resolve comment sau khi sửa, không để comment treo.

**Reviewer:**

- Phân biệt: blocking (phải sửa) vs suggestion (nên sửa) vs nit (nhỏ, tùy ý).
- Comment vào code cụ thể, không nhận xét chung chung.
- Ưu tiên review logic/correctness → security → performance → style.
- Không approve khi chưa đọc — lướt qua là không đủ.
- Không để PR chờ review > 1 ngày (trừ PR lớn cần thời gian).

---

## 6. Rebase vs Merge

**Dùng rebase khi:**

- Sync feature branch với `main`/`develop` → `git rebase main`.
- Squash WIP commit trước khi mở PR → `git rebase -i HEAD~n`.
- Kết quả: history tuyến tính, dễ đọc.

**Dùng merge khi:**

- Merge PR vào `main` (qua GitHub/GitLab) — tạo merge commit rõ ràng thời điểm merge.
- Không merge branch cá nhân bằng merge commit — sẽ tạo noise trong history.

**Không rebase branch đã push và người khác đang dùng** — sẽ gây conflict history cho người khác.

---

## 7. Hotfix workflow

```
1. Branch từ main: git checkout -b hotfix/payment-null-crash main
2. Fix + commit
3. Mở PR → review nhanh → merge vào main
4. Tag release: git tag -a v1.2.1 -m "fix: payment null crash"
5. Merge hotfix vào develop để sync
```

---

## 8. Checklist git review

1. Branch name đúng convention không?
2. Commit message đúng Conventional Commits không?
3. Có commit WIP/debug trên branch chính không?
4. `.env` và file nhạy cảm có trong `.gitignore` không?
5. PR có description đủ context không?
6. PR size có hợp lý không (< 400 dòng)?
7. Có conflict chưa resolve không?
8. Comment review có phân biệt blocking vs suggestion không?
