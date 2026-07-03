# File Upload Skill — S3, Validation, Processing Pipeline

Dùng khi implement tính năng upload file/ảnh. Upload sai = lỗ hổng bảo mật, tốn storage vô ích, hoặc server crash vì file quá lớn.

---

## 1. Nguyên tắc upload an toàn

- **Validate trước khi lưu**: type, size, extension — không tin tưởng client.
- **Không lưu file trên server** (disk của app server) — lưu trên object storage (S3, R2, GCS).
- **Rename file** — không dùng tên file gốc từ client (path traversal, overwrite risk).
- **Presigned URL** cho upload lớn — client upload thẳng lên S3, không qua server.
- **Process async** — resize, compress, scan virus trong background job, không block request.
- **Giới hạn size** ở nhiều tầng: nginx/load balancer, middleware, S3 policy.

---

## 2. Validate file — trước khi làm gì khác

```ts
// lib/fileValidation.ts
import { fromBuffer } from "file-type";

export interface FileValidationOptions {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
}

export async function validateFile(buffer: Buffer, originalName: string, options: FileValidationOptions): Promise<void> {
  // 1. Check size
  if (buffer.length > options.maxSizeBytes) {
    throw new ValidationError([
      {
        field: "file",
        message: `File size exceeds limit of ${options.maxSizeBytes / 1024 / 1024}MB`,
      },
    ]);
  }

  // 2. Check MIME type từ buffer (không từ header — client có thể fake)
  const detected = await fromBuffer(buffer);
  if (!detected || !options.allowedMimeTypes.includes(detected.mime)) {
    throw new ValidationError([
      {
        field: "file",
        message: `File type not allowed. Allowed: ${options.allowedMimeTypes.join(", ")}`,
      },
    ]);
  }

  // 3. Check extension khớp với MIME type
  const ext = originalName.split(".").pop()?.toLowerCase();
  if (!ext || !options.allowedExtensions.includes(ext)) {
    throw new ValidationError([{ field: "file", message: "File extension not allowed" }]);
  }
}

// Config theo use case
export const IMAGE_OPTIONS: FileValidationOptions = {
  maxSizeBytes: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  allowedExtensions: ["jpg", "jpeg", "png", "webp"],
};

export const DOCUMENT_OPTIONS: FileValidationOptions = {
  maxSizeBytes: 20 * 1024 * 1024, // 20MB
  allowedMimeTypes: ["application/pdf"],
  allowedExtensions: ["pdf"],
};
```

---

## 3. Upload flow — 2 pattern chính

### Pattern A: Server-side upload (file nhỏ < 5MB)

```
Client → POST /api/upload (multipart) → Server validate → Upload S3 → Return URL
```

```ts
// controller
async function uploadAvatar(req: Request, res: Response) {
  const file = req.file; // multer parsed
  if (!file) throw new ValidationError([{ field: "file", message: "File is required" }]);

  await validateFile(file.buffer, file.originalname, IMAGE_OPTIONS);

  const key = generateFileKey("avatars", file.originalname);
  const url = await s3Service.upload(key, file.buffer, file.mimetype);

  res.json({ data: { url, key } });
}
```

### Pattern B: Presigned URL (file lớn, upload thẳng từ client lên S3)

```
Client → POST /api/upload/presign → Server tạo presigned URL → Client upload trực tiếp lên S3 → Client confirm lên Server
```

```ts
// Step 1: Server tạo presigned URL
async function getPresignedUrl(req: Request, res: Response) {
  const { filename, contentType, size } = req.body;

  // Validate metadata trước
  if (size > 100 * 1024 * 1024) throw new BusinessError('FILE_TOO_LARGE', 'Max 100MB');
  if (!ALLOWED_TYPES.includes(contentType)) throw new ValidationError([...]);

  const key = generateFileKey('uploads', filename);
  const presignedUrl = await s3Service.getPresignedUploadUrl(key, contentType, 3600);

  res.json({ data: { presignedUrl, key } });
}

// Step 2: Client upload thẳng lên S3 với presigned URL
// fetch(presignedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })

// Step 3: Client confirm upload xong
async function confirmUpload(req: Request, res: Response) {
  const { key } = req.body;
  // Verify file có tồn tại trên S3 không
  const exists = await s3Service.exists(key);
  if (!exists) throw new NotFoundError('Uploaded file');

  // Lưu URL vào DB, trigger processing job
  await mediaRepo.create({ key, url: s3Service.getPublicUrl(key), userId: req.user.id });
  await imageProcessingQueue.add('process', { key });

  res.json({ data: { url: s3Service.getPublicUrl(key) } });
}
```

---

## 4. S3 service — wrapper chuẩn

```ts
// lib/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: env.S3_REGION });

export const s3Service = {
  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
    return this.getPublicUrl(key);
  },

  async getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(s3, new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }), { expiresIn });
  },

  async delete(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  },

  async exists(key: string): Promise<boolean> {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return true;
    } catch {
      return false;
    }
  },

  getPublicUrl(key: string): string {
    return `${env.CDN_URL}/${key}`;
  },
};
```

**Generate file key — không dùng tên gốc:**

```ts
import { cuid } from "@paralleldrive/cuid2";
import path from "path";

function generateFileKey(folder: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  const id = cuid();
  const date = new Date().toISOString().slice(0, 7); // 2024-06
  return `${folder}/${date}/${id}${ext}`;
  // → avatars/2024-06/clx1234abc.jpg
}
```

---

## 5. Image processing — async pipeline

```ts
// queues/imageProcessing.worker.ts
import sharp from "sharp";

imageProcessingWorker.process(async (job) => {
  const { key } = job.data;

  // Download từ S3
  const buffer = await s3Service.download(key);

  // Validate là image thật (sharp sẽ throw nếu không phải)
  const metadata = await sharp(buffer).metadata();

  // Tạo các size variants
  const variants = [
    { suffix: "thumb", width: 100, height: 100, fit: "cover" },
    { suffix: "sm", width: 400, height: 400, fit: "inside" },
    { suffix: "md", width: 800, height: 800, fit: "inside" },
  ];

  await Promise.all(
    variants.map(async (v) => {
      const processed = await sharp(buffer)
        .resize(v.width, v.height, { fit: v.fit as any })
        .webp({ quality: 85 })
        .toBuffer();

      const variantKey = key.replace(/\.[^.]+$/, `_${v.suffix}.webp`);
      await s3Service.upload(variantKey, processed, "image/webp");
    }),
  );

  // Update DB với các variant URLs
  await mediaRepo.updateVariants(
    key,
    variants.map((v) => ({
      size: v.suffix,
      key: key.replace(/\.[^.]+$/, `_${v.suffix}.webp`),
    })),
  );
});
```

---

## 6. FE — upload với progress

```ts
async function uploadFile(file: File, onProgress?: (pct: number) => void) {
  // 1. Validate client-side (chỉ để UX, không phải security)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File quá lớn, tối đa 5MB");
  }

  // 2. Lấy presigned URL
  const {
    data: { presignedUrl, key },
  } = await api.post("/upload/presign", {
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });

  // 3. Upload thẳng lên S3 với progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => (xhr.status < 400 ? resolve() : reject(new Error("Upload failed"))));
    xhr.addEventListener("error", reject);
    xhr.open("PUT", presignedUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });

  // 4. Confirm
  const { data } = await api.post("/upload/confirm", { key });
  return data.url;
}
```

---

## 7. Checklist upload review

1. MIME type có được detect từ buffer (không phải Content-Type header) không?
2. File size có được giới hạn ở middleware không (không chỉ validate sau khi nhận)?
3. File key có được generate ngẫu nhiên (không dùng tên gốc từ client) không?
4. File có được lưu trên S3/object storage (không phải disk server) không?
5. Image processing (resize, compress) có chạy async (queue) không?
6. Presigned URL có TTL ngắn (< 1 giờ) không?
7. S3 bucket có block public access, chỉ serve qua CDN/signed URL không?
8. File không dùng nữa có được xoá khỏi S3 không (tránh orphaned file tốn tiền)?
9. FE validate client-side chỉ để UX, không thay thế server validation?
10. Upload error có được handle và show message thân thiện không?
