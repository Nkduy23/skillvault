# Caching Skill — Redis, HTTP Cache, React Query, CDN

Dùng khi thiết kế cache layer hoặc debug stale data. Cache sai còn tệ hơn không cache — user thấy data cũ, bug khó reproduce.

---

## 1. Khi nào nên cache — và không nên

**Nên cache:**

- Data ít thay đổi, đọc nhiều: config, danh mục, lookup table, user profile.
- Response API tốn kém tính toán: aggregate, report, recommendation.
- External API có rate limit hoặc charge per call.
- Static asset: image, font, JS/CSS bundle.

**Không cache (hoặc TTL rất ngắn):**

- Data realtime: giá stock, inventory số lượng còn lại, live score.
- Data theo user mà user vừa thay đổi: profile vừa update, order vừa tạo.
- Security-sensitive data: token, permission — cache sai là lỗ hổng.
- Data có tính đúng đắn cao: số dư tài khoản, kết quả giao dịch.

**Cache key phải đủ phân biệt:**

- Bao gồm tất cả param ảnh hưởng output: userId, role, locale, filter.
- Miss cache key = cache poisoning hoặc user A thấy data user B.

---

## 2. Redis — server-side cache

**Setup connection đúng cách:**

```ts
// lib/redis.ts
import { Redis } from "ioredis";
import { env } from "@/config/env";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
});

redis.on("error", (err) => logger.error({ err }, "Redis connection error"));
```

**Helper cache-aside pattern:**

```ts
async function getOrCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;

  const data = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  return data;
}

// Dùng:
const categories = await getOrCache(
  "categories:all",
  60 * 60, // 1 giờ
  () => categoryRepo.findAll(),
);
```

**Cache key convention:**

```
{domain}:{identifier}:{variant}
categories:all
user:{userId}:profile
user:{userId}:orders:page:{page}
product:{productId}:stock
report:revenue:2024-06
```

**Invalidate đúng thời điểm:**

```ts
// Sau khi update → xoá cache liên quan
async function updateUserProfile(userId: string, data: UpdateDto) {
  const updated = await userRepo.update(userId, data);
  await redis.del(`user:${userId}:profile`);
  return updated;
}

// Invalidate theo pattern (cẩn thận — expensive trên Redis cluster)
const keys = await redis.keys(`user:${userId}:*`);
if (keys.length) await redis.del(...keys);
```

**TTL strategy:**

```
Config / lookup table    : 1-24 giờ (invalidate khi update)
User profile             : 5-15 phút
List với filter          : 1-5 phút
Aggregate / report       : 1-60 phút tuỳ tần suất thay đổi
Session                  : theo session TTL
Rate limit counter       : 1 phút (sliding window)
```

---

## 3. HTTP Cache — tận dụng browser và CDN

**Cache-Control header:**

```ts
// Static asset — cache lâu, tên file có hash
res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
// → browser cache 1 năm, CDN cache, không revalidate

// API response đọc public, ít thay đổi
res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
// → fresh 5 phút, serve stale thêm 60s trong khi revalidate background

// API response per-user — không cache shared
res.setHeader("Cache-Control", "private, max-age=60");
// → chỉ browser cache, không CDN cache

// Data thay đổi thường xuyên — không cache
res.setHeader("Cache-Control", "no-store");
```

**ETag / Last-Modified:**

```ts
// ETag: hash của data — client gửi If-None-Match, server trả 304 nếu không thay đổi
const etag = `"${hashData(data)}"`;
if (req.headers["if-none-match"] === etag) {
  return res.status(304).end();
}
res.setHeader("ETag", etag);
res.json(data);
```

**Không cache nhầm:**

- API có auth (`Authorization` header) mà dùng `public` cache → CDN trả data của user A cho user B.
- Luôn dùng `Vary: Authorization` hoặc `private` cho private endpoint.

---

## 4. React Query cache — client-side

**staleTime vs gcTime:**

```ts
{
  staleTime: 1000 * 60 * 5,  // data "fresh" 5 phút — không refetch background
  gcTime: 1000 * 60 * 10,    // giữ cache 10 phút sau unmount — đã được unmount
}
```

**Prefetch để UX mượt:**

```ts
// Prefetch detail khi hover card → instant khi click
onMouseEnter={() => {
  queryClient.prefetchQuery({
    queryKey: orderKeys.detail(orderId),
    queryFn: () => orderApi.getById(orderId),
    staleTime: 1000 * 60,
  });
}}
```

**setQueryData sau mutation — tránh refetch ngay:**

```ts
onSuccess: (updatedOrder) => {
  // Update cache trực tiếp thay vì invalidate + refetch
  queryClient.setQueryData(orderKeys.detail(updatedOrder.id), updatedOrder);
  // Invalidate list vì sort/filter có thể thay đổi
  queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
},
```

---

## 5. CDN — cache static và edge

**Next.js static asset:** tự động có content hash trong tên file → cache `immutable` an toàn.

**Image CDN:**

- Next.js `/api/image` tự cache image đã resize — không cache lại thủ công.
- External image CDN (Cloudinary, imgix): set cache TTL ở CDN level.

**API caching tại edge (Next.js):**

```ts
// Route Handler cache
export const revalidate = 3600; // cache 1 giờ, ISR

// fetch với cache option
const data = await fetch(url, {
  next: { revalidate: 60 }, // cache 60 giây
  // hoặc
  cache: "no-store", // không cache
});
```

---

## 6. Checklist cache review

1. Cache key có bao gồm đủ param phân biệt (userId, filter, locale) không?
2. Có cache data security-sensitive (token, permission) không? (không được)
3. TTL có hợp lý với tần suất thay đổi data không?
4. Sau khi mutation, cache liên quan có được invalidate không?
5. HTTP Cache-Control: private endpoint có dùng `private` không? (tránh CDN cache nhầm)
6. Có `Vary: Authorization` khi cần cache theo user không?
7. React Query staleTime có được set phù hợp không (tránh refetch liên tục)?
8. Redis connection có error handling không? App có fallback khi Redis down không?
9. Cache invalidation strategy: event-based hay TTL? Phù hợp với use case không?
10. Có over-cache (cache data thay đổi liên tục) không?
