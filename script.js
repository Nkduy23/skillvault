(() => {
  "use strict";

  const STORAGE_KEY = "skillvault.customSkills.v1";
  const grid = document.getElementById("skill-grid");
  const emptyState = document.getElementById("empty-state");
  const filterRow = document.getElementById("filter-row");
  const searchInput = document.getElementById("search-input");
  const navCount = document.getElementById("nav-count");
  const toastEl = document.getElementById("toast");

  let fileSkills = []; // loaded from /skills/manifest.json (read-only, source = "file")
  let customSkills = []; // loaded from localStorage (editable, source = "local")
  let activeTag = "all";
  let activeQuery = "";
  let activeId = null;

  // ---------- storage ----------
  function loadCustom() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      customSkills = raw ? JSON.parse(raw) : [];
    } catch {
      customSkills = [];
    }
  }
  function saveCustom() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customSkills));
  }

  function allSkills() {
    return [...fileSkills, ...customSkills];
  }

  function uid() {
    return "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- load file-based skills ----------
  async function loadFileSkills() {
    try {
      const res = await fetch("./skills/manifest.json", { cache: "no-store" });
      if (!res.ok) throw new Error("no manifest");
      const manifest = await res.json();
      const loaded = await Promise.all(
        manifest.map(async (entry) => {
          try {
            const r = await fetch("./skills/" + entry.file, { cache: "no-store" });
            const content = r.ok ? await r.text() : "(không đọc được file " + entry.file + ")";
            return {
              id: "file_" + entry.file,
              source: "file",
              title: entry.title || entry.file,
              desc: entry.desc || "",
              tags: entry.tags || [],
              content,
              file: entry.file,
              updatedAt: null,
            };
          } catch {
            return null;
          }
        }),
      );
      fileSkills = loaded.filter(Boolean);
    } catch {
      // Likely opened via file:// without a local server — fetch is blocked by CORS.
      fileSkills = [];
    }
  }

  // ---------- rendering ----------
  function allTags() {
    const set = new Set();
    allSkills().forEach((s) => (s.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }

  function renderFilters() {
    const tags = allTags();
    filterRow.innerHTML = "";
    const allChip = makeChip("all", "Tất cả");
    filterRow.appendChild(allChip);
    tags.forEach((t) => filterRow.appendChild(makeChip(t, t)));
  }

  function makeChip(tag, label) {
    const btn = document.createElement("button");
    btn.className = "filter-chip" + (tag === activeTag ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      activeTag = tag;
      renderFilters();
      renderGrid();
    });
    return btn;
  }

  function matchesQuery(skill, q) {
    if (!q) return true;
    const hay = (skill.title + " " + (skill.desc || "") + " " + skill.content).toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function renderGrid() {
    const list = allSkills().filter((s) => {
      const tagOk = activeTag === "all" || (s.tags || []).includes(activeTag);
      return tagOk && matchesQuery(s, activeQuery);
    });

    grid.innerHTML = "";
    emptyState.hidden = list.length !== 0;

    list.forEach((s) => {
      const card = document.createElement("div");
      card.className = "skill-card";
      card.addEventListener("click", () => openView(s.id));

      const head = document.createElement("div");
      head.className = "card-head";
      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = s.title;
      head.appendChild(title);
      if (s.source === "local") {
        const dot = document.createElement("span");
        dot.className = "card-meta";
        dot.textContent = "local";
        head.appendChild(dot);
      }
      card.appendChild(head);

      const desc = document.createElement("div");
      desc.className = "card-desc";
      desc.textContent = s.desc || "—";
      card.appendChild(desc);

      const foot = document.createElement("div");
      foot.className = "card-foot";
      const tagRow = document.createElement("div");
      tagRow.className = "tag-row";
      (s.tags || []).forEach((t) => {
        const b = document.createElement("span");
        b.className = "tag-badge";
        b.textContent = t;
        tagRow.appendChild(b);
      });
      foot.appendChild(tagRow);
      card.appendChild(foot);

      grid.appendChild(card);
    });

    navCount.textContent = allSkills().length + " skills";
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  // ---------- view modal ----------
  const modalView = document.getElementById("modal-view");
  const viewTitle = document.getElementById("view-title-text");
  const viewTags = document.getElementById("view-tags");
  const viewContent = document.getElementById("view-content");
  const viewContentRendered = document.getElementById("view-content-rendered");
  const viewContentRaw = document.getElementById("view-content-raw");
  const viewMeta = document.getElementById("view-meta");
  const btnModeRendered = document.getElementById("view-mode-rendered");
  const btnModeRaw = document.getElementById("view-mode-raw");

  function setViewMode(mode) {
    const rendered = mode === "rendered";
    viewContentRendered.hidden = !rendered;
    viewContentRaw.hidden = rendered;
    btnModeRendered.classList.toggle("active", rendered);
    btnModeRaw.classList.toggle("active", !rendered);
  }
  btnModeRendered.addEventListener("click", () => setViewMode("rendered"));
  btnModeRaw.addEventListener("click", () => setViewMode("raw"));

  function openView(id) {
    const s = allSkills().find((x) => x.id === id);
    if (!s) return;
    activeId = id;
    viewTitle.textContent = s.title;
    viewTags.innerHTML = "";
    (s.tags || []).forEach((t) => {
      const b = document.createElement("span");
      b.className = "tag-badge";
      b.textContent = t;
      viewTags.appendChild(b);
    });
    viewContent.textContent = s.content;
    try {
      viewContentRendered.innerHTML = window.marked ? window.marked.parse(s.content) : escapeHtml(s.content);
    } catch {
      viewContentRendered.innerHTML = escapeHtml(s.content);
    }
    setViewMode("rendered");
    viewMeta.textContent = s.source === "file" ? "Nguồn: skills/" + s.file + " (chỉ đọc)" : "Nguồn: lưu local trong trình duyệt";
    document.getElementById("view-edit").style.display = s.source === "local" ? "flex" : "none";
    document.getElementById("view-delete").style.display = s.source === "local" ? "flex" : "none";
    modalView.hidden = false;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return "<pre>" + div.innerHTML + "</pre>";
  }
  document.getElementById("modal-view-close").addEventListener("click", () => (modalView.hidden = true));
  modalView.addEventListener("click", (e) => {
    if (e.target === modalView) modalView.hidden = true;
  });
  document.getElementById("view-copy").addEventListener("click", async () => {
    const s = allSkills().find((x) => x.id === activeId);
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.content);
      toast("Đã copy nội dung skill");
    } catch {
      toast("Không copy được — hãy chọn thủ công");
    }
  });
  document.getElementById("view-delete").addEventListener("click", () => {
    if (!activeId) return;
    if (!confirm("Xoá skill này khỏi local?")) return;
    customSkills = customSkills.filter((x) => x.id !== activeId);
    saveCustom();
    modalView.hidden = true;
    renderFilters();
    renderGrid();
    toast("Đã xoá");
  });
  document.getElementById("view-edit").addEventListener("click", () => {
    const s = allSkills().find((x) => x.id === activeId);
    if (!s) return;
    modalView.hidden = true;
    openAdd(s);
  });

  // ---------- add/edit modal ----------
  const modalAdd = document.getElementById("modal-add");
  const modalTitleText = document.getElementById("modal-title-text");
  const inputName = document.getElementById("input-name");
  const inputTags = document.getElementById("input-tags");
  const inputDesc = document.getElementById("input-desc");
  const inputContent = document.getElementById("input-content");
  let editingId = null;

  function openAdd(existing) {
    editingId = existing ? existing.id : null;
    modalTitleText.textContent = existing ? "Sửa skill" : "Thêm skill mới";
    inputName.value = existing ? existing.title : "";
    inputTags.value = existing ? (existing.tags || []).join(", ") : "";
    inputDesc.value = existing ? existing.desc || "" : "";
    inputContent.value = existing ? existing.content : "";
    modalAdd.hidden = false;
    inputName.focus();
  }
  document.getElementById("btn-add-open").addEventListener("click", () => openAdd(null));
  document.getElementById("modal-add-close").addEventListener("click", () => (modalAdd.hidden = true));
  document.getElementById("modal-add-cancel").addEventListener("click", () => (modalAdd.hidden = true));
  modalAdd.addEventListener("click", (e) => {
    if (e.target === modalAdd) modalAdd.hidden = true;
  });

  document.getElementById("modal-add-save").addEventListener("click", () => {
    const title = inputName.value.trim();
    const content = inputContent.value.trim();
    if (!title || !content) {
      toast("Cần tên và nội dung skill");
      return;
    }
    const tags = inputTags.value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingId) {
      const idx = customSkills.findIndex((x) => x.id === editingId);
      if (idx !== -1) {
        customSkills[idx] = {
          ...customSkills[idx],
          title,
          desc: inputDesc.value.trim(),
          tags,
          content,
          updatedAt: Date.now(),
        };
      }
    } else {
      customSkills.push({
        id: uid(),
        source: "local",
        title,
        desc: inputDesc.value.trim(),
        tags,
        content,
        file: null,
        updatedAt: Date.now(),
      });
    }
    saveCustom();
    modalAdd.hidden = true;
    renderFilters();
    renderGrid();
    toast(editingId ? "Đã cập nhật" : "Đã lưu skill mới");
  });

  // ---------- search ----------
  searchInput.addEventListener("input", () => {
    activeQuery = searchInput.value;
    renderGrid();
  });

  // ---------- export / import ----------
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(customSkills, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skill-vault-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById("import-file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("format sai");
      parsed.forEach((s) => {
        if (!s.id) s.id = uid();
        s.source = "local";
      });
      customSkills = [...customSkills, ...parsed];
      saveCustom();
      renderFilters();
      renderGrid();
      toast("Đã nhập " + parsed.length + " skill");
    } catch {
      toast("File backup không hợp lệ");
    } finally {
      e.target.value = "";
    }
  });

  // ---------- boot ----------
  (async function init() {
    loadCustom();
    await loadFileSkills();
    renderFilters();
    renderGrid();
  })();
})();
