# NativeNote — AI Writing Coach

Ứng dụng viết dạng Notion dành cho người Việt trình độ B1–C1. NativeNote kết hợp Tiptap, phản hồi Gemini có cấu trúc, learning memory được người học xác nhận, luyện viết theo ngữ cảnh và Gemini Live cho role-play bằng giọng nói.

## Chạy local

Yêu cầu Node.js 22+, pnpm và Docker.

```bash
cp .env.example .env.local
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```

Cấu hình Google OAuth callback là `http://localhost:3000/api/auth/callback/google`. Điền `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `GEMINI_API_KEYS` và tùy chọn `GEMINI_DEFAULT_MODEL` trong `.env.local`. `GEMINI_API_KEYS` là danh sách key phân cách bằng dấu phẩy; nên dùng key từ các Google project khác nhau để việc xoay key có thể tăng quota thực tế.

## Kiến trúc

- Next.js App Router và Auth.js/Google OAuth.
- Tiptap block-first lưu JSONB cùng plain text/version trong PostgreSQL. Paragraph, heading, quote, code block và từng list/task item có `blockId` ổn định.
- Block controls hỗ trợ nút `+`, searchable picker, Turn into, Ask AI, màu, duplicate, deep-link, move/delete và drag-and-drop bằng chuột hoặc touch hold.
- UI editor/AI panel dùng preset shadcn/ui `base-mira` với Base UI primitives; thao tác menu có keyboard navigation và focus management.
- Drizzle schema tại `src/db/schema.ts`, migration versioned trong `drizzle/`.
- Gemini text model chỉ chạy server-side, bắt buộc qua Zod structured output và sử dụng pool key round-robin có retry/cooldown cho lỗi transient.
- Gemini Live dùng ephemeral token một lần; browser không nhận API key dài hạn.
- Finding chỉ tạo learning item sau thao tác Apply hoặc Save. Apply kiểm tra page version và exact text range để ngăn sửa nhầm nội dung cũ.
- Ask AI theo block giữ snapshot và page version; kết quả stale không thể ghi đè nội dung mới.

## Kiểm tra chất lượng

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

E2E chạy Chromium trên desktop và mobile touch emulation. Cài browser runtime lần đầu bằng `pnpm exec playwright install chromium`.

Các route AI có input limit, ownership check, rate limit và lỗi cấu hình rõ ràng. Pool Gemini và rate limiter hiện là in-memory, phù hợp một instance; khi scale ngang cần thay bằng shared store/quota coordinator. Raw API key không được đưa vào log hoặc error response.
