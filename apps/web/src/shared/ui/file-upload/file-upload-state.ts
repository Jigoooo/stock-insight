export const DEFAULT_FILE_UPLOAD_ACCEPT = '.csv,.xlsx,.pdf';
export const DEFAULT_FILE_UPLOAD_MAX_SIZE = 10 * 1024 * 1024;

export type FileUploadMode = 'single' | 'multiple';
export type FileUploadRejectionReason = 'size' | 'type';

export type FileUploadSource = {
  name: string;
  size: number;
  type?: string;
};

export type FileUploadFile = {
  id: string;
  name: string;
  nativeFile?: File;
  size: number;
  type?: string;
};

export type FileUploadRejection = {
  file: FileUploadSource;
  reason: FileUploadRejectionReason;
};

type ResolveFileUploadSelectionOptions = {
  accept: string;
  createId: () => string;
  currentFiles: readonly FileUploadFile[];
  incomingFiles: Iterable<FileUploadSource>;
  maxSize: number;
  mode: FileUploadMode;
};

function matchesAccept(file: FileUploadSource, accept: string) {
  const tokens = accept
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const fileName = file.name.toLowerCase();
  const fileType = file.type?.toLowerCase() ?? '';

  return tokens.some((token) => {
    if (token.startsWith('.')) return fileName.endsWith(token);
    if (token.endsWith('/*')) return fileType.startsWith(token.slice(0, -1));
    return fileType === token;
  });
}

export function resolveFileUploadSelection({
  accept,
  createId,
  currentFiles,
  incomingFiles,
  maxSize,
  mode,
}: ResolveFileUploadSelectionOptions) {
  const acceptedFiles: FileUploadFile[] = [];
  const rejections: FileUploadRejection[] = [];

  for (const incomingFile of incomingFiles) {
    if (!matchesAccept(incomingFile, accept)) {
      rejections.push({ file: incomingFile, reason: 'type' });
      continue;
    }

    if (incomingFile.size > maxSize) {
      rejections.push({ file: incomingFile, reason: 'size' });
      continue;
    }

    acceptedFiles.push({
      id: createId(),
      name: incomingFile.name,
      nativeFile:
        typeof File !== 'undefined' && incomingFile instanceof File ? incomingFile : undefined,
      size: incomingFile.size,
      type: incomingFile.type,
    });
  }

  const files =
    acceptedFiles.length === 0
      ? currentFiles
      : mode === 'single'
        ? acceptedFiles.slice(0, 1)
        : currentFiles.concat(acceptedFiles);

  return { files, rejections };
}

export function formatFileUploadSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
