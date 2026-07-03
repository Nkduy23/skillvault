# Performance FE Skill — Core Web Vitals, Bundle, Lazy Load

Dùng khi app bị chậm, điểm Lighthouse thấp, hoặc review performance trước khi launch. Đo trước, tối ưu sau — không tối ưu theo cảm giác.

---

## 1. Đo trước khi làm gì

**Công cụ:**

- **Lighthouse** (Chrome DevTools) — overview LCP, CLS, FID/INP, bundle.
- **React DevTools Profiler** — component render time, re-render.
- **Chrome Performance tab** — flame graph, long task.
- **next/bundle-analyzer** — xem bundle size từng chunk.
- **web-vitals library** — đo real user metrics, gửi về analytics.

```ts
// Đo Core Web Vitals thực tế của user
import { onLCP, onINP, onCLS } from "web-vitals";
onLCP((metric) => sendToAnalytics(metric));
onINP((metric) => sendToAnalytics(metric));
onCLS((metric) => sendToAnalytics(metric));
```

**Setup bundle analyzer:**

```bash
npm i @next/bundle-analyzer
# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});
# ANALYZE=true npm run build
```

---

## 2. Core Web Vitals — target và cách fix

**LCP (Largest Contentful Paint) — < 2.5s**
LCP là thời gian render element lớn nhất (thường là hero image hoặc heading lớn).

Fix:

- `<Image priority />` cho above-the-fold image.
- `preload` font và critical resource.
- Giảm TTFB: cache response, CDN edge, tối ưu DB query.
- Không lazy load above-the-fold content.

```tsx
// ✅ Next.js Image với priority
<Image src="/hero.jpg" alt="hero" width={1200} height={600} priority />

// ✅ Preload critical font
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossOrigin="" />
```

**CLS (Cumulative Layout Shift) — < 0.1**
CLS là layout bị nhảy khi load.

Fix:

- Luôn có `width`/`height` cho image và video.
- Reserve space cho dynamic content (skeleton, min-height).
- Không inject content phía trên existing content.
- Font display: `swap` để tránh FOIT.

```css
@font-face {
  font-display: swap; /* tránh invisible text khi font chưa load */
}
```

**INP (Interaction to Next Paint) — < 200ms**
INP là thời gian phản hồi khi user interact.

Fix:

- Không block main thread: tính toán nặng → `Web Worker` hoặc `requestIdleCallback`.
- Debounce input handler tốn kém.
- Avoid long task > 50ms trong event handler.

---

## 3. Bundle size — giảm code gửi xuống browser

**Dynamic import cho code không cần ngay:**

```tsx
// Component nặng chỉ dùng khi user mở modal
const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), {
  loading: () => <Skeleton height={300} />,
  ssr: false, // nếu component dùng window/document
});

// Chart library
const Chart = dynamic(() => import("recharts").then((m) => ({ default: m.LineChart })), {
  ssr: false,
});
```

**Import cụ thể thay vì import cả lib:**

```ts
// ❌ Import cả lodash — 70kb+
import _ from "lodash";
_.debounce(fn, 300);

// ✅ Import hàm cụ thể — vài kb
import debounce from "lodash/debounce";
// hoặc dùng native
const debounced = useCallback(debounce(fn, 300), []);
```

**Tree-shaking phải hoạt động:**

- Dùng ES module (`import/export`), không CommonJS (`require`).
- Kiểm tra lib có `"sideEffects": false` trong package.json không.
- Icons: import từng icon, không import cả bộ.

```ts
// ❌ Import cả bộ icon
import * as Icons from "lucide-react";

// ✅ Import từng icon
import { Search, ChevronDown } from "lucide-react";
```

**Phân tích dependency nặng:**

```
Thường gặp:
- moment.js (67kb) → date-fns hoặc dayjs
- lodash full → lodash-es hoặc import từng hàm
- chart.js → recharts hoặc chỉ import chart type cần
- pdf-lib → dynamic import, chỉ khi user cần export
```

---

## 4. Image optimization

```tsx
// Next.js Image — luôn dùng thay <img>
<Image
  src="/product.jpg"
  alt="Product"
  width={400}
  height={300}
  sizes="(max-width: 768px) 100vw, 400px" // responsive sizing
  quality={85} // default 75, tăng nếu blur
  placeholder="blur" // cần blurDataURL
  blurDataURL={blurUrl}
/>
```

**Responsive image:**

```tsx
// Full width trên mobile, 50% trên desktop
<Image
  src={src}
  alt={alt}
  fill // điền vào parent
  sizes="(max-width: 768px) 100vw, 50vw"
  className="object-cover"
/>
```

**Format:** Next.js tự convert sang WebP/AVIF — đảm bảo `next.config.js` có domain nếu dùng external image.

---

## 5. React render optimization

**Memo đúng chỗ:**

```tsx
// Chỉ memo khi:
// 1. Component render nặng (chart, list lớn, complex UI)
// 2. Props thường không thay đổi
// 3. Đã đo và xác nhận re-render là vấn đề

const ExpensiveChart = React.memo(
  ({ data, config }: Props) => {
    return <Chart data={data} />;
  },
  (prev, next) => {
    // Custom compare nếu cần — return true = không re-render
    return prev.data === next.data && prev.config.type === next.config.type;
  },
);
```

**Virtualize list dài:**

```tsx
// List > 100 item → dùng virtualization
import { useVirtualizer } from "@tanstack/react-virtual";

const rowVirtualizer = useVirtualizer({
  count: items.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 60, // estimated row height
});
```

**useMemo cho tính toán nặng:**

```tsx
// Chỉ dùng khi tính toán thật sự nặng (sort/filter mảng lớn, aggregate)
const sortedOrders = useMemo(() => orders.slice().sort((a, b) => b.total - a.total), [orders]);

// Không useMemo cho tính toán đơn giản — overhead cao hơn lợi ích
const fullName = `${user.firstName} ${user.lastName}`; // không cần useMemo
```

---

## 6. Loading strategy

**Skeleton screen thay vì spinner:**

```tsx
// Spinner: user không biết content sẽ có gì
// Skeleton: user thấy layout trước, ít cảm giác chờ hơn

function OrderListSkeleton() {
  return Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-row" />);
}

// Dùng Suspense + skeleton
<Suspense fallback={<OrderListSkeleton />}>
  <OrderList />
</Suspense>;
```

**Prefetch route quan trọng:**

```tsx
// Next.js tự prefetch link khi vào viewport
// Prefetch thủ công khi biết user sẽ đến đó
const router = useRouter();
router.prefetch("/dashboard"); // prefetch khi hover menu
```

---

## 7. Checklist performance FE

1. Above-the-fold image có `priority` không?
2. Image có `width`/`height` hoặc `fill` + `sizes` không? (tránh CLS)
3. Component nặng (chart, editor, PDF) có dynamic import không?
4. Có import cả lib khi chỉ cần 1-2 hàm không?
5. List > 100 item có được virtualize không?
6. `React.memo` / `useMemo` có được đo trước khi thêm không?
7. Font có `font-display: swap` không?
8. Bundle analyzer đã chạy chưa? Có chunk nào > 200kb không?
9. Core Web Vitals (LCP/CLS/INP) đã đo chưa?
10. Có long task > 50ms trong event handler không?
