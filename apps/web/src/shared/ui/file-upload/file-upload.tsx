import { FileText, Upload, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  forwardRef,
  useId,
  useRef,
  useState,
  type DragEvent,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  DEFAULT_FILE_UPLOAD_ACCEPT,
  DEFAULT_FILE_UPLOAD_MAX_SIZE,
  formatFileUploadSize,
  resolveFileUploadSelection,
  type FileUploadFile,
  type FileUploadMode,
  type FileUploadRejection,
} from './file-upload-state';
import styles from './file-upload.module.css';

import { cn } from '@/shared/lib/utils';

export type FileUploadVariant = 'hairline' | 'inset';

export type DropzoneProps = Omit<HTMLAttributes<HTMLDivElement>, 'onDrop' | 'title'> & {
  accept?: string;
  description?: ReactNode;
  disabled?: boolean;
  dragActive?: boolean;
  filled?: boolean;
  invalid?: boolean;
  mode?: FileUploadMode;
  onDragActiveChange?: (active: boolean) => void;
  onFilesSelected: (files: FileList) => void;
  pending?: boolean;
  pickerLabel?: ReactNode;
  selectedCount?: number;
  title?: ReactNode;
  variant?: FileUploadVariant;
};

export const Dropzone = forwardRef<HTMLButtonElement, DropzoneProps>(function Dropzone(
  {
    accept = DEFAULT_FILE_UPLOAD_ACCEPT,
    className,
    description,
    disabled = false,
    dragActive,
    filled = false,
    invalid = false,
    mode = 'single',
    onDragActiveChange,
    onFilesSelected,
    pending = false,
    pickerLabel,
    selectedCount = 0,
    title,
    variant = 'hairline',
    ...props
  },
  forwardedRef,
) {
  const inputId = useId();
  const internalInputRef = useRef<HTMLInputElement>(null);
  const [internalDragActive, setInternalDragActive] = useState(false);
  const isDragControlled = dragActive !== undefined;
  const currentDragActive = dragActive ?? internalDragActive;
  const blocked = disabled || pending;

  const setDragActive = (active: boolean) => {
    if (!isDragControlled) setInternalDragActive(active);
    onDragActiveChange?.(active);
  };

  const selectFiles = (files: FileList | null) => {
    if (!files) return;
    if (blocked) {
      setDragActive(false);
      return;
    }
    onFilesSelected(files);
    setDragActive(false);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (!(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
      setDragActive(false);
    }
  };

  return (
    <div
      {...props}
      aria-busy={pending || undefined}
      aria-disabled={blocked || undefined}
      aria-invalid={invalid || undefined}
      className={cn(styles.dropzone, className)}
      data-disabled={blocked || undefined}
      data-drag-active={currentDragActive || undefined}
      data-filled={filled || undefined}
      data-invalid={invalid || undefined}
      data-slot="dropzone"
      data-variant={variant}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!blocked) setDragActive(true);
      }}
      onDragLeave={handleDragLeave}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        selectFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={internalInputRef}
        id={inputId}
        type="file"
        hidden
        tabIndex={-1}
        accept={accept}
        disabled={blocked}
        multiple={mode === 'multiple'}
        onChange={(event) => {
          selectFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />

      {currentDragActive ? (
        <div className={styles.dropFeedback} aria-live="polite">
          <Upload aria-hidden="true" size={20} strokeWidth={1.7} />
          <strong>{filled && mode === 'single' ? '놓아서 교체' : '놓아서 추가'}</strong>
          <small>{description ?? 'CSV, XLSX, PDF 파일을 여기에 놓으세요.'}</small>
        </div>
      ) : (
        <>
          <span className={styles.uploadIcon} aria-hidden="true">
            <Upload size={17} strokeWidth={1.8} />
          </span>
          <strong>
            {title ?? (filled ? `${selectedCount}개 파일 선택됨` : '리서치 파일 추가')}
          </strong>
          <small>
            {description ??
              (filled
                ? mode === 'single'
                  ? '새 파일을 놓으면 현재 파일을 교체합니다.'
                  : '파일을 더 놓거나 목록에서 개별 삭제할 수 있습니다.'
                : '끌어다 놓거나 직접 선택 · CSV, XLSX, PDF · 최대 10MB')}
          </small>
          <button
            ref={forwardedRef}
            className={styles.picker}
            data-slot="dropzone-picker"
            type="button"
            disabled={blocked}
            onClick={() => internalInputRef.current?.click()}
          >
            {pickerLabel ?? (filled ? '파일 다시 선택' : '파일 선택')}
          </button>
        </>
      )}
    </div>
  );
});

export type FileUploadProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange' | 'title'
> & {
  accept?: string;
  defaultFiles?: readonly FileUploadFile[];
  description?: ReactNode;
  disabled?: boolean;
  dragActive?: boolean;
  files?: readonly FileUploadFile[];
  invalid?: boolean;
  maxSize?: number;
  mode?: FileUploadMode;
  onDragActiveChange?: (active: boolean) => void;
  onFilesChange?: (files: readonly FileUploadFile[]) => void;
  onReject?: (rejections: readonly FileUploadRejection[]) => void;
  pending?: boolean;
  title?: ReactNode;
  variant?: FileUploadVariant;
};

const uploadEnterEase = [0.22, 1, 0.36, 1] as const;
const uploadExitEase = [0.4, 0, 1, 1] as const;

export function FileUpload({
  accept = DEFAULT_FILE_UPLOAD_ACCEPT,
  className,
  defaultFiles = [],
  description,
  disabled = false,
  dragActive,
  files,
  invalid = false,
  maxSize = DEFAULT_FILE_UPLOAD_MAX_SIZE,
  mode = 'single',
  onDragActiveChange,
  onFilesChange,
  onReject,
  pending = false,
  title,
  variant = 'hairline',
  ...props
}: FileUploadProps): ReactElement {
  const componentId = useId();
  const reducedMotion = useReducedMotion();
  const pickerRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusPickerAfterExit = useRef(false);
  const uploadIdSequence = useRef(0);
  const [uncontrolledFiles, setUncontrolledFiles] =
    useState<readonly FileUploadFile[]>(defaultFiles);
  const controlled = files !== undefined;
  const currentFiles = controlled ? files : uncontrolledFiles;

  const commitFiles = (nextFiles: readonly FileUploadFile[]) => {
    if (!controlled) setUncontrolledFiles(nextFiles);
    onFilesChange?.(nextFiles);
  };

  const updateFiles = (fileList: FileList) => {
    const result = resolveFileUploadSelection({
      accept,
      createId: () => `${componentId}-upload-${++uploadIdSequence.current}`,
      currentFiles,
      incomingFiles: fileList,
      maxSize,
      mode,
    });

    if (result.files !== currentFiles) commitFiles(result.files);
    if (result.rejections.length > 0) onReject?.(result.rejections);
  };

  const removeFile = (file: FileUploadFile, index: number) => {
    const remainingFiles = currentFiles.filter((item) => item.id !== file.id);
    const nextFile = remainingFiles[Math.min(index, remainingFiles.length - 1)];

    if (nextFile) deleteButtonRefs.current[nextFile.id]?.focus();
    else focusPickerAfterExit.current = true;

    commitFiles(remainingFiles);
  };

  const handleListExitComplete = () => {
    if (!focusPickerAfterExit.current) return;
    focusPickerAfterExit.current = false;
    pickerRef.current?.focus();
  };

  return (
    <div {...props} className={cn(styles.root, className)} data-slot="file-upload">
      <Dropzone
        ref={pickerRef}
        accept={accept}
        description={description}
        disabled={disabled}
        dragActive={dragActive}
        filled={currentFiles.length > 0}
        invalid={invalid}
        mode={mode}
        onDragActiveChange={onDragActiveChange}
        onFilesSelected={updateFiles}
        pending={pending}
        selectedCount={currentFiles.length}
        title={title}
        variant={variant}
      />

      <ul
        className={styles.fileList}
        aria-label="선택된 파일"
        aria-hidden={currentFiles.length === 0 || undefined}
      >
        <AnimatePresence initial={false} mode="popLayout" onExitComplete={handleListExitComplete}>
          {currentFiles.map((file, index) => (
            <motion.li
              key={file.id}
              layout={reducedMotion ? false : 'position'}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={
                reducedMotion
                  ? { opacity: 1, transition: { duration: 0.1 } }
                  : {
                      opacity: 1,
                      x: 0,
                      y: 0,
                      scale: 1,
                      transition: {
                        duration: 0.16,
                        delay: index * 0.028,
                        ease: uploadEnterEase,
                      },
                    }
              }
              exit={
                reducedMotion
                  ? { opacity: 0, transition: { duration: 0.1 } }
                  : {
                      opacity: 0,
                      x: index % 2 === 0 ? -18 : 18,
                      scale: 0.985,
                      transition: { duration: 0.14, ease: uploadExitEase },
                    }
              }
              transition={
                reducedMotion
                  ? undefined
                  : {
                      layout: {
                        type: 'spring',
                        duration: 0.24,
                        bounce: 0,
                        delay: index * 0.018,
                      },
                    }
              }
            >
              <span className={styles.fileIcon} aria-hidden="true">
                <FileText size={15} strokeWidth={1.7} />
              </span>
              <span className={styles.fileMeta}>
                <strong>{file.name}</strong>
                <small>{formatFileUploadSize(file.size)} · 준비됨</small>
              </span>
              <button
                ref={(node) => {
                  deleteButtonRefs.current[file.id] = node;
                }}
                type="button"
                aria-label={`${file.name} 삭제`}
                data-slot="file-upload-remove"
                disabled={disabled || pending}
                onClick={() => removeFile(file, index)}
              >
                <X aria-hidden="true" size={14} strokeWidth={1.8} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
