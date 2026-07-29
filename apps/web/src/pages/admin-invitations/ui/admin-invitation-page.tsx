import { Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Copy, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import styles from './admin-invitation-page.module.css';
import { issueInvitation, revokeInvitation } from '../model/admin-invitation-functions';

import type { AccountRole, AdminInvitation } from '@/server/auth/admin-invitations';
import { Button } from '@/shared/ui/primitives/button';

type AdminInvitationPageProps = {
  initialInvitations: AdminInvitation[];
  role: Extract<AccountRole, 'owner' | 'admin'>;
};

const statusLabels: Record<AdminInvitation['status'], string> = {
  active: '사용 가능',
  revoked: '폐기됨',
  expired: '만료됨',
  exhausted: '사용 완료',
};

const transportError = '요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminInvitationPage({ initialInvitations, role }: AdminInvitationPageProps) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [revealedCode, setRevealedCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);

  const handleIssue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setError(undefined);
    setStatusMessage(undefined);
    setRevealedCode(undefined);
    setCopied(false);
    startTransition(async () => {
      try {
        const result = await issueInvitation({
          data: {
            label: String(values.get('label') ?? ''),
            maxUses: Number(values.get('maxUses') ?? 1),
            expiresInHours: String(values.get('expiresInHours') ?? '24') as '24' | '72' | '168',
          },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setInvitations((current) => [result.invitation, ...current]);
        setRevealedCode(result.code);
        form.reset();
      } catch {
        setError(transportError);
      }
    });
  };

  const handleRevoke = (invitationId: string, label: string) => {
    setError(undefined);
    setStatusMessage(undefined);
    startTransition(async () => {
      try {
        const result = await revokeInvitation({
          data: { invitationId, reason: '관리자 화면에서 발급 취소' },
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setInvitations((current) =>
          current.map((invitation) =>
            invitation.invitationId === invitationId
              ? {
                  ...invitation,
                  status: 'revoked',
                  revokedAt: new Date().toISOString(),
                  revokedReason: '관리자 화면에서 발급 취소',
                }
              : invitation,
          ),
        );
        setStatusMessage(`${label} 코드를 폐기했습니다.`);
        requestAnimationFrame(() => listHeadingRef.current?.focus());
      } catch {
        setError(transportError);
      }
    });
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        {/* A raw <a> here forced a full document reload on every trip back to
            the workspace; <Link> keeps it a client-side transition. */}
        <Link className={styles.backLink} to="/workspace/today">
          <ArrowLeft aria-hidden="true" /> 워크스페이스
        </Link>
        <div className={styles.headingRow}>
          <div>
            <span className={styles.eyebrow}>Access control</span>
            <h1>가입 코드 관리</h1>
            <p>가입할 사람에게 전달할 제한된 코드를 발급하고 즉시 폐기할 수 있습니다.</p>
          </div>
          <span className={styles.roleBadge}>
            <ShieldCheck aria-hidden="true" /> {role === 'owner' ? 'Owner' : 'Admin'}
          </span>
        </div>
      </header>

      <section className={styles.issuePanel} aria-labelledby="issue-heading">
        <div>
          <span className={styles.sectionIndex}>01</span>
          <h2 id="issue-heading">새 가입 코드 발급</h2>
        </div>
        <form className={styles.form} onSubmit={handleIssue}>
          <label>
            <span>메모</span>
            <input
              name="label"
              minLength={1}
              maxLength={120}
              required
              placeholder="예: 김지구 초대"
            />
          </label>
          <label>
            <span>사용 가능 횟수</span>
            <select name="maxUses" defaultValue="1">
              <option value="1">1회</option>
              <option value="2">2회</option>
              <option value="5">5회</option>
              <option value="10">10회</option>
            </select>
          </label>
          <label>
            <span>유효 기간</span>
            <select name="expiresInHours" defaultValue="24">
              <option value="24">24시간</option>
              <option value="72">3일</option>
              <option value="168">7일</option>
            </select>
          </label>
          <Button className={styles.issueButton} disabled={pending} type="submit" variant="primary">
            <UserPlus aria-hidden="true" /> {pending ? '처리 중' : '코드 발급'}
          </Button>
        </form>

        <output className={styles.status} aria-live="polite">
          {error ? <span role="alert">{error}</span> : null}
          {statusMessage ? <span>{statusMessage}</span> : null}
          {revealedCode ? (
            <div className={styles.secretPanel}>
              <div>
                <strong>이 코드는 지금 한 번만 표시됩니다.</strong>
                <p>안전한 채널로 전달한 뒤 이 화면에 보관하지 마세요.</p>
              </div>
              <code>{revealedCode}</code>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(revealedCode)
                    .then(() => setCopied(true))
                    .catch(() =>
                      setError('클립보드에 복사하지 못했습니다. 코드를 직접 선택해 주세요.'),
                    );
                }}
              >
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? '복사됨' : '복사'}
              </Button>
            </div>
          ) : null}
        </output>
      </section>

      <section className={styles.listPanel} aria-labelledby="list-heading">
        <div className={styles.listHeading}>
          <div>
            <span className={styles.sectionIndex}>02</span>
            <h2 id="list-heading" ref={listHeadingRef} tabIndex={-1}>
              발급 이력
            </h2>
          </div>
          <span>{invitations.length}개</span>
        </div>
        <div className={styles.tableViewport}>
          <table>
            <caption>가입 코드 발급 및 사용 상태</caption>
            <thead>
              <tr>
                <th scope="col">메모</th>
                <th scope="col">상태</th>
                <th scope="col">사용</th>
                <th scope="col">만료</th>
                <th scope="col">발급자</th>
                <th scope="col">
                  <span className={styles.visuallyHidden}>관리</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.empty}>
                    아직 발급한 코드가 없습니다.
                  </td>
                </tr>
              ) : (
                invitations.map((invitation) => (
                  <tr key={invitation.invitationId}>
                    <th scope="row" className={styles.rowHeader}>
                      <strong>{invitation.label}</strong>
                      <small>{formatDateTime(invitation.createdAt)}</small>
                    </th>
                    <td>
                      <span className={styles.statusBadge} data-status={invitation.status}>
                        {statusLabels[invitation.status]}
                      </span>
                    </td>
                    <td>
                      {invitation.usedCount} / {invitation.maxUses}
                    </td>
                    <td>
                      {invitation.expiresAt ? formatDateTime(invitation.expiresAt) : '만료 없음'}
                    </td>
                    <td>{invitation.createdByUsername ?? '기존 발급'}</td>
                    <td>
                      {invitation.status === 'active' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label={`${invitation.label} 코드 폐기`}
                          onClick={() => handleRevoke(invitation.invitationId, invitation.label)}
                        >
                          <XCircle aria-hidden="true" /> 폐기
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
