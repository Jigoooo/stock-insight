import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';

import styles from './textarea.module.css';

import { cn } from '@/shared/lib/utils';

export type TextareaVariant = 'plain' | 'composer' | 'editorial';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  footer?: ReactNode;
  shellClassName?: string;
  variant?: TextareaVariant;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, footer, shellClassName, variant = 'plain', ...props },
  ref,
) {
  return (
    <div
      className={cn(styles.shell, shellClassName)}
      data-slot="textarea-shell"
      data-variant={variant}
    >
      <textarea
        ref={ref}
        className={cn(styles.textarea, className)}
        data-slot="textarea-control"
        {...props}
      />
      {footer ? (
        <div className={styles.footer} data-slot="textarea-footer">
          {footer}
        </div>
      ) : null}
    </div>
  );
});
