# Realtime Skill — WebSocket, SSE, Polling

Dùng khi cần data cập nhật realtime: chat, notification, live status, dashboard. Chọn đúng pattern — over-engineer realtime là waste resource.

---

## 1. Chọn pattern phù hợp

```
Polling             → đơn giản, đủ khi delay 5-30s chấp nhận được
                      VD: dashboard refresh mỗi 30s, check job status

SSE (Server-Sent Events) → server push 1 chiều, đơn giản hơn WebSocket
                           VD: notification, live feed, progress bar, log stream

WebSocket           → 2 chiều realtime, phức tạp hơn
                      VD: chat, collaborative editing, game, live cursor
```

**Nguyên tắc:** Dùng polling trước. Nếu delay không chấp nhận được → SSE. Nếu cần 2 chiều → WebSocket.

---

## 2. Polling — đơn giản và hiệu quả khi đúng chỗ

```ts
// Hook polling với React Query
function useOrderStatus(orderId: string) {
  return useQuery({
    queryKey: ["orders", orderId, "status"],
    queryFn: () => orderApi.getStatus(orderId),
    refetchInterval: (query) => {
      // Dừng poll khi order đã finished
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "CANCELLED") return false;
      return 5000; // poll mỗi 5 giây
    },
    refetchIntervalInBackground: false, // dừng khi tab không active
  });
}
```

**Adaptive polling — tăng interval khi không có thay đổi:**

```ts
let interval = 2000;
const MAX_INTERVAL = 30000;

async function poll() {
  const newData = await fetchData();
  if (hasChanged(newData, previousData)) {
    interval = 2000; // reset về nhanh khi có thay đổi
    updateUI(newData);
  } else {
    interval = Math.min(interval * 1.5, MAX_INTERVAL); // backoff
  }
  setTimeout(poll, interval);
}
```

---

## 3. SSE — Server-Sent Events

**BE (Express):**

```ts
app.get("/api/notifications/stream", authenticate, (req, res) => {
  // Setup SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  const userId = req.user.id;

  // Send event helper
  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Initial ping
  send("connected", { userId });

  // Subscribe to events cho user này
  const unsubscribe = eventBus.subscribe(`user:${userId}`, (event) => {
    send(event.type, event.payload);
  });

  // Heartbeat — tránh connection timeout
  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 30000);

  // Cleanup khi client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
```

**FE:**

```ts
function useSSE<T>(url: string, eventType: string) {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener(eventType, (e) => {
      setData(JSON.parse(e.data));
    });

    es.addEventListener("error", (e) => {
      // SSE tự reconnect — chỉ log, không cần xử lý thủ công
      console.error("SSE error", e);
    });

    return () => es.close();
  }, [url, eventType]);

  return data;
}

// Dùng
const notification = useSSE<Notification>("/api/notifications/stream", "new-notification");
```

**Event bus đơn giản (in-process):**

```ts
// lib/eventBus.ts
type Listener = (event: AppEvent) => void;
const listeners = new Map<string, Set<Listener>>();

export const eventBus = {
  subscribe(channel: string, listener: Listener) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
    return () => listeners.get(channel)?.delete(listener); // unsubscribe fn
  },
  emit(channel: string, event: AppEvent) {
    listeners.get(channel)?.forEach((fn) => fn(event));
  },
};

// Sau khi tạo order → emit event → SSE push xuống client
eventBus.emit(`user:${userId}`, {
  type: "ORDER_STATUS_CHANGED",
  payload: { orderId, status: "CONFIRMED" },
});
```

**Scale-out: dùng Redis Pub/Sub thay vì in-process event bus** khi có nhiều server instance.

---

## 4. WebSocket — Socket.IO

**BE setup:**

```ts
import { Server } from "socket.io";

const io = new Server(httpServer, {
  cors: { origin: env.FE_URL, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Auth middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  try {
    const user = await verifyToken(token);
    socket.data.user = user;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.data.user.id;
  socket.join(`user:${userId}`); // room theo user
  logger.info({ userId, socketId: socket.id }, "Client connected");

  // Handle events từ client
  socket.on("message:send", async (data, callback) => {
    try {
      const message = await messageService.create(data);
      // Broadcast tới room
      io.to(`chat:${data.roomId}`).emit("message:new", message);
      callback({ ok: true, messageId: message.id });
    } catch (err) {
      callback({ ok: false, error: "Failed to send message" });
    }
  });

  socket.on("disconnect", (reason) => {
    logger.info({ userId, reason }, "Client disconnected");
  });
});

// Push từ server (không phải từ socket event)
export function pushToUser(userId: string, event: string, data: unknown) {
  io.to(`user:${userId}`).emit(event, data);
}
```

**FE:**

```ts
// lib/socket.ts
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket(token: string) {
  socket = io(env.NEXT_PUBLIC_WS_URL, {
    auth: { token },
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connect error:", err.message);
  });

  return socket;
}

export function getSocket() {
  if (!socket?.connected) throw new Error("Socket not connected");
  return socket;
}
```

---

## 5. Scaling realtime

**SSE/WebSocket + Redis Pub/Sub:**

```
User A kết nối → Server instance 1
User B kết nối → Server instance 2

Server 1 emit event → Redis Pub/Sub → Server 2 nhận → Push xuống User B
```

**Socket.IO Redis adapter:**

```ts
import { createAdapter } from "@socket.io/redis-adapter";
io.adapter(createAdapter(redisPublisher, redisSubscriber));
// Tự động sync event giữa nhiều instance
```

---

## 6. Checklist realtime review

1. Đã chọn đúng pattern (polling/SSE/WS) chưa?
2. SSE/WebSocket endpoint có authenticate không?
3. Cleanup (unsubscribe, clearInterval) khi client disconnect chưa?
4. Heartbeat có được setup để tránh timeout không?
5. FE có handle reconnect không (SSE tự reconnect, WS cần config)?
6. Nhiều server instance → có Redis adapter/Pub/Sub không?
7. Event có type-safe (không gửi any) không?
8. Room/channel naming có phòng ngừa user nghe nhầm data của người khác không?
9. Lỗi trong WebSocket handler có được catch và trả về callback không?
10. Load test: bao nhiêu concurrent connection server có thể handle?
