import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { StoredDocumentError } from "@/packages/documents";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED"
  ) {
    super(message);
  }
}

export async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id)
    throw new ApiError(401, "Bạn cần đăng nhập để tiếp tục.", "UNAUTHORIZED");
  return session.user.id;
}

export function apiError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  if (error instanceof StoredDocumentError) {
    return NextResponse.json(
      { error: error.message, code: "INVALID_STORED_DOCUMENT" },
      { status: 422 }
    );
  }
  console.error(
    error instanceof Error
      ? { name: error.name, message: error.message }
      : "Unknown API error"
  );
  return NextResponse.json(
    { error: "Đã có lỗi xảy ra. Vui lòng thử lại." },
    { status: 500 }
  );
}

export async function parseJson<T>(
  request: Request,
  schema: { parse(value: unknown): T }
): Promise<T> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 200_000)
    throw new ApiError(
      413,
      "Nội dung vượt quá giới hạn cho phép.",
      "PAYLOAD_TOO_LARGE"
    );
  try {
    return schema.parse(await request.json());
  } catch {
    throw new ApiError(400, "Dữ liệu gửi lên không hợp lệ.", "INVALID_INPUT");
  }
}
