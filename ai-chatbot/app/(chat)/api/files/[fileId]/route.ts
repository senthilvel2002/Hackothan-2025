import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getFileFromStorage } from "@/lib/files/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fileId } = await params;

  if (!fileId) {
    return NextResponse.json({ error: "File ID is required" }, { status: 400 });
  }

  const fileData = getFileFromStorage(fileId);

  if (!fileData) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  // Return the file with appropriate content type
  return new NextResponse(fileData.buffer, {
    headers: {
      "Content-Type": fileData.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${fileId}"`,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
