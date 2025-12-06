// Simple in-memory file storage (shared between upload and get routes)
// In production, replace this with a proper file storage service (S3, Azure Blob, etc.)
const fileStorage = new Map<string, { buffer: ArrayBuffer; contentType: string }>();

export function setFileInStorage(
  fileId: string,
  buffer: ArrayBuffer,
  contentType: string
) {
  fileStorage.set(fileId, { buffer, contentType });
}

export function getFileFromStorage(fileId: string) {
  return fileStorage.get(fileId);
}

