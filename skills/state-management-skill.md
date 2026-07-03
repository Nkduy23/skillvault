# State Management Skill — Zustand, React Query, Context

Dùng khi thiết kế state hoặc review state management hiện tại. Chọn đúng tool cho đúng loại state — over-engineer state = re-render không kiểm soát được.

---

## 1. Phân loại state — chọn đúng chỗ lưu

```
Server state    → React Query / SWR
                  (data từ API, cần cache, sync, refetch)

Global UI state → Zustand
                  (theme, sidebar open, modal, toast, user session)

Local UI state  → useState / useReducer
                  (form input, toggle, hover, tab active)

URL state       → searchParams / router
                  (filter, pagination, search query — shareable link)

Form state      → React Hook Form
                  (validation, dirty, touched, submit)
```

**Quy tắc vàng:** State sống ở tầng thấp nhất có thể. Lift up chỉ khi có ≥ 2 component thật sự cần share.

---

## 2. React Query — server state

**Setup:**

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 phút — không refetch khi data còn fresh
      gcTime: 1000 * 60 * 10, // 10 phút — xoá cache sau khi unmount
      retry: 2,
      refetchOnWindowFocus: false, // tắt nếu data không cần realtime
    },
  },
});
```

**Query key convention — phải nhất quán:**

```ts
// Dạng array, từ general → specific
["orders"][("orders", { status: "PENDING" })][("orders", orderId)][("orders", orderId, "items")]; // list tất cả // list với filter // single item // nested resource

// Tách thành queryKeys object để tránh typo
export const orderKeys = {
  all: ["orders"] as const,
  lists: () => [...orderKeys.all, "list"] as const,
  list: (filter: OrderFilter) => [...orderKeys.lists(), filter] as const,
  detail: (id: string) => [...orderKeys.all, id] as const,
};
```

**Mutation + invalidate đúng chỗ:**

```ts
const cancelOrder = useMutation({
  mutationFn: (orderId: string) => orderApi.cancel(orderId),
  onSuccess: (_, orderId) => {
    // Invalidate list + specific item
    queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    queryClient.invalidateQueries({ queryKey: orderKeys.detail(orderId) });
  },
  onError: (err) => {
    toast.error("Huỷ đơn thất bại");
    console.error(err);
  },
});
```

**Optimistic update (khi UX cần instant):**

```ts
onMutate: async (orderId) => {
  await queryClient.cancelQueries({ queryKey: orderKeys.detail(orderId) });
  const previous = queryClient.getQueryData(orderKeys.detail(orderId));
  queryClient.setQueryData(orderKeys.detail(orderId), old => ({
    ...old, status: 'CANCELLED'
  }));
  return { previous }; // rollback context
},
onError: (err, orderId, context) => {
  queryClient.setQueryData(orderKeys.detail(orderId), context?.previous);
},
```

**Không dùng React Query cho:**

- State UI thuần (modal open, sidebar...) — dùng Zustand.
- Form state — dùng React Hook Form.
- State không có server source — dùng useState.

---

## 3. Zustand — global UI state

**Setup store đúng cách:**

```ts
// store/useUIStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface UIState {
  sidebarOpen: boolean;
  theme: "light" | "dark";
  toggleSidebar: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      sidebarOpen: true,
      theme: "light",
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
      setTheme: (theme) => set({ theme }),
    }),
    { name: "ui-store" },
  ),
);
```

**Selector để tránh re-render thừa:**

```ts
// ❌ Subscribe toàn bộ store — re-render mỗi khi bất kỳ field nào thay đổi
const store = useUIStore();

// ✅ Chỉ subscribe field cần dùng
const sidebarOpen = useUIStore((s) => s.sidebarOpen);
const toggleSidebar = useUIStore((s) => s.toggleSidebar);
```

**Tách store theo domain — không gộp 1 store khổng lồ:**

```
store/
  useUIStore.ts      ← sidebar, modal, theme
  useUserStore.ts    ← current user, session
  useCartStore.ts    ← cart state (nếu không dùng React Query)
```

**Persist (localStorage):**

```ts
import { persist } from "zustand/middleware";

create<ThemeState>()(
  persist((set) => ({ theme: "light", setTheme: (t) => set({ theme: t }) }), {
    name: "theme-storage",
    partialize: (s) => ({ theme: s.theme }), // chỉ persist field cần
  }),
);
```

---

## 4. Context — dùng đúng chỗ, đừng lạm dụng

**Hợp lý khi dùng Context:**

- Static config ít thay đổi (i18n locale, feature flags, theme tokens).
- Data chỉ đi theo 1 subtree nhỏ, không cần global.
- Không có logic phức tạp, chỉ truyền data xuống.

**Không dùng Context cho:**

- State thay đổi thường xuyên (mỗi keystroke, scroll, hover) → re-render toàn bộ consumer.
- Data từ API → dùng React Query.
- Global state phức tạp có action → dùng Zustand.

**Tách context value và dispatch để giảm re-render:**

```ts
const CountValueCtx = createContext<number>(0);
const CountDispatchCtx = createContext<Dispatch>(() => {});

// Component chỉ đọc value không bị re-render khi dispatch thay đổi
function Display() {
  const count = useContext(CountValueCtx);
  return <div>{count}</div>;
}
```

---

## 5. URL state — thường bị bỏ quên

Dùng cho state người dùng muốn share hoặc bookmark:

```ts
// Filter, sort, search, pagination → URL
// ?status=PENDING&page=2&sort=createdAt

const searchParams = useSearchParams();
const status = searchParams.get("status") ?? "ALL";
const page = Number(searchParams.get("page") ?? 1);

// Update URL không làm reload trang
const router = useRouter();
router.push(`?status=${newStatus}&page=1`, { scroll: false });
```

---

## 6. Checklist state review

1. Server data có đang lưu trong useState thay vì React Query không?
2. Query key có nhất quán, không bị typo không?
3. Mutation có invalidate đúng query key sau khi thành công không?
4. Zustand store có dùng selector (không subscribe toàn bộ) không?
5. Context có được dùng cho state thay đổi thường xuyên không? (nếu có → chuyển Zustand)
6. Store có được tách theo domain không, hay 1 store chứa tất cả?
7. Filter/pagination có trên URL không, hay đang lưu trong useState (mất khi reload)?
8. Có state nào được lift up quá cao (global) trong khi chỉ 1 component dùng không?
