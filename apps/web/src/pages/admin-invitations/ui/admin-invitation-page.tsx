import { Link } from '@tanstack/react-router';
import { ArrowLeft, Check, Copy, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { useRef, useState, useTransition, type FormEvent } from 'react';

import styles from './admin-invitation-page.module.css';
import { issueInvitation, revokeInvitation } from '../model/admin-invitation-functions';

import { workspaceSections } from '@/features/workspace-navigation';
import { logout } from '@/pages/auth/model/auth-functions';
import type { AccountRole, AdminInvitation } from '@/server/auth/admin-invitations';
import { Button } from '@/shared/ui/button';
import { InlineFeedbackRegion } from '@/shared/ui/feedback';
import { Field, FieldLabel } from '@/shared/ui/field';
import { IdentityBadge, type IdentityTone } from '@/shared/ui/identity-content';
import { Input } from '@/shared/ui/input';
import { PresenceRegion } from '@/shared/ui/motion';
import { Select, type SelectOption } from '@/shared/ui/select';
import { notify } from '@/shared/ui/toast';
import {
  DataTable,
  DetailSurface,
  PageHeader,
  Panel,
  PanelHeader,
  WorkspaceState,
} from '@/shared/ui/workspace';
import { WorkspaceShell } from '@/widgets/workspace-shell';

type AdminInvitationPageProps = {
  accountRole: Extract<AccountRole, 'owner' | 'admin'>;
  initialInvitations: AdminInvitation[];
  issueInvitationAction?: IssueInvitationAction;
  logoutAction?: LogoutAction;
  revokeInvitationAction?: RevokeInvitationAction;
};

export type IssueInvitationAction = (
  ...args: Parameters<typeof issueInvitation>
) => ReturnType<typeof issueInvitation>;

export type RevokeInvitationAction = (
  ...args: Parameters<typeof revokeInvitation>
) => ReturnType<typeof revokeInvitation>;

export type LogoutAction = (...args: Parameters<typeof logout>) => ReturnType<typeof logout>;

type PendingAction = { kind: 'issue' } | { kind: 'revoke'; invitationId: string };

const statusLabels: Record<AdminInvitation['status'], string> = {
  active: '사용 가능',
  revoked: '폐기됨',
  expired: '만료됨',
  exhausted: '사용 완료',
};

const transportError = '요청을 완료하지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';

const maxUsesOptions: readonly SelectOption[] = [
  { value: '1', label: '1회' },
  { value: '2', label: '2회' },
  { value: '5', label: '5회' },
  { value: '10', label: '10회' },
];

const expirationOptions: readonly SelectOption[] = [
  { value: '24', label: '24시간' },
  { value: '72', label: '3일' },
  { value: '168', label: '7일' },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function invitationStatusTone(status: AdminInvitation['status']): IdentityTone {
  if (status === 'active') return 'positive';
  if (status === 'revoked' || status === 'expired') return 'pending';
  return 'neutral';
}

export function AdminInvitationPage({
  accountRole,
  initialInvitations,
  issueInvitationAction = issueInvitation,
  logoutAction = logout,
  revokeInvitationAction = revokeInvitation,
}: AdminInvitationPageProps) {
  const [invitations, setInvitations] = useState(initialInvitations);
  const [revealedCode, setRevealedCode] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [statusMessage, setStatusMessage] = useState<string>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>();
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
    setPendingAction({ kind: 'issue' });
    startTransition(async () => {
      try {
        const result = await issueInvitationAction({
          data: {
            label: String(values.get('label') ?? ''),
            maxUses: Number(values.get('maxUses') ?? 1),
            expiresInHours: String(values.get('expiresInHours') ?? '24') as '24' | '72' | '168',
          },
        });
        if (!result.ok) {
          setError(result.error);
          void notify.error('요청을 완료하지 못했습니다', { description: result.error });
          return;
        }
        setInvitations((current) => [result.invitation, ...current]);
        setRevealedCode(result.code);
        form.reset();
        void notify.success('가입 코드를 발급했습니다', {
          description: '한 번만 표시되는 코드를 안전한 채널로 전달하세요.',
        });
      } catch {
        setError(transportError);
        void notify.error('요청을 완료하지 못했습니다', { description: transportError });
      } finally {
        setPendingAction(undefined);
      }
    });
  };

  const handleRevoke = (invitationId: string, label: string) => {
    setError(undefined);
    setStatusMessage(undefined);
    setPendingAction({ kind: 'revoke', invitationId });
    startTransition(async () => {
      try {
        const result = await revokeInvitationAction({
          data: { invitationId, reason: '관리자 화면에서 발급 취소' },
        });
        if (!result.ok) {
          setError(result.error);
          void notify.error('요청을 완료하지 못했습니다', { description: result.error });
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
        void notify.success('가입 코드를 폐기했습니다', {
          description: `${label} 코드는 더 이상 사용할 수 없습니다.`,
        });
        requestAnimationFrame(() => listHeadingRef.current?.focus());
      } catch {
        setError(transportError);
        void notify.error('요청을 완료하지 못했습니다', { description: transportError });
      } finally {
        setPendingAction(undefined);
      }
    });
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const result = await logoutAction();
      if (result.ok) window.location.assign('/login');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <WorkspaceShell
      activeSection="admin-invitations"
      contextualActions={
        <Link className={styles.workspaceLink} to="/workspace/today">
          <ArrowLeft aria-hidden="true" /> 워크스페이스
        </Link>
      }
      navigationItems={workspaceSections}
      navigationPending={null}
      onLogout={() => void handleLogout()}
    >
      <div className={styles.page}>
        <PageHeader
          eyebrow="Access control"
          title="가입 코드 관리"
          description="가입할 사람에게 전달할 제한된 코드를 발급하고 즉시 폐기할 수 있습니다."
        />

        <Panel className={styles.issuePanel} aria-labelledby="issue-heading">
          <PanelHeader
            className={styles.panelHeader}
            meta={
              <IdentityBadge className={styles.roleBadge} tone="progress" variant="soft-fill">
                <ShieldCheck aria-hidden="true" /> {accountRole === 'owner' ? 'Owner' : 'Admin'}
              </IdentityBadge>
            }
          >
            <span>Invitation policy</span>
            <h2 id="issue-heading">새 가입 코드 발급</h2>
          </PanelHeader>

          <form className={styles.form} onSubmit={handleIssue} aria-busy={pending}>
            <Field className={styles.formField} data-disabled={pending || undefined}>
              <FieldLabel htmlFor="invitation-label">메모</FieldLabel>
              <Input
                disabled={pending}
                id="invitation-label"
                name="label"
                minLength={1}
                maxLength={120}
                required
                placeholder="예: 김지구 초대"
              />
            </Field>
            <Field className={styles.formField} data-disabled={pending || undefined}>
              <FieldLabel id="max-uses-label">사용 가능 횟수</FieldLabel>
              <Select
                aria-labelledby="max-uses-label"
                defaultValue="1"
                disabled={pending}
                name="maxUses"
                options={maxUsesOptions}
              />
            </Field>
            <Field className={styles.formField} data-disabled={pending || undefined}>
              <FieldLabel id="expiration-label">유효 기간</FieldLabel>
              <Select
                aria-labelledby="expiration-label"
                defaultValue="24"
                disabled={pending}
                name="expiresInHours"
                options={expirationOptions}
              />
            </Field>
            <Button
              className={styles.issueButton}
              pending={pendingAction?.kind === 'issue' && pending}
              pendingLabel="발급 중"
              type="submit"
              variant="primary"
            >
              <UserPlus aria-hidden="true" /> 코드 발급
            </Button>
          </form>

          <div className={styles.status} data-testid="admin-invitation-status">
            <InlineFeedbackRegion
              state={
                pending
                  ? { key: 'pending', message: '요청을 처리하고 있습니다.' }
                  : statusMessage
                    ? { key: 'success', message: statusMessage }
                    : { key: 'idle' }
              }
            />
            <PresenceRegion
              className={styles.outputPresence}
              presenceKey="admin-invitation-error"
              present={Boolean(error)}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
            >
              <WorkspaceState
                announcement="inherit"
                className={styles.outputState}
                kind="error"
                title="요청을 완료하지 못했습니다"
                description={error ?? ''}
              />
            </PresenceRegion>
            <PresenceRegion
              className={styles.secretPresence}
              presenceKey="admin-invitation-code"
              present={Boolean(revealedCode)}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <DetailSurface
                className={styles.secretSurface}
                aria-label="한 번만 표시되는 가입 코드"
              >
                <div className={styles.secretPanel}>
                  <div>
                    <strong>이 코드는 지금 한 번만 표시됩니다.</strong>
                    <p>안전한 채널로 전달한 뒤 이 화면에 보관하지 마세요.</p>
                  </div>
                  <code>{revealedCode ?? ''}</code>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(revealedCode ?? '')
                        .then(() => {
                          setCopied(true);
                          void notify.success('가입 코드를 복사했습니다', {
                            description: '안전한 채널에 붙여 넣어 전달하세요.',
                          });
                        })
                        .catch(() => {
                          const copyError =
                            '클립보드에 복사하지 못했습니다. 코드를 직접 선택해 주세요.';
                          setError(copyError);
                          void notify.error('가입 코드를 복사하지 못했습니다', {
                            description: copyError,
                          });
                        });
                    }}
                  >
                    {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    {copied ? '복사됨' : '복사'}
                  </Button>
                </div>
              </DetailSurface>
            </PresenceRegion>
          </div>
        </Panel>

        <Panel className={styles.listPanel} aria-labelledby="list-heading">
          <PanelHeader className={styles.panelHeader} meta={`${invitations.length}개`}>
            <span>Invitation history</span>
            <h2 id="list-heading" ref={listHeadingRef} tabIndex={-1}>
              발급 이력
            </h2>
          </PanelHeader>
          {invitations.length === 0 ? (
            <WorkspaceState
              className={styles.emptyState}
              kind="empty"
              title="아직 발급한 코드가 없습니다"
              description="새 가입 코드를 발급하면 사용 상태와 만료 시각을 여기에서 확인할 수 있습니다."
            />
          ) : (
            <DataTable
              caption="가입 코드 발급 및 사용 상태"
              captionClassName={styles.visuallyHidden}
              className={styles.table}
              containerProps={{
                'aria-label': '가입 코드 발급 이력 가로 스크롤 영역',
                tabIndex: 0,
              }}
            >
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
                {invitations.map((invitation) => (
                  <tr key={invitation.invitationId}>
                    <th scope="row" className={styles.rowHeader}>
                      <strong>{invitation.label}</strong>
                      <small>{formatDateTime(invitation.createdAt)}</small>
                    </th>
                    <td>
                      <IdentityBadge
                        className={styles.statusBadge}
                        data-status={invitation.status}
                        tone={invitationStatusTone(invitation.status)}
                        variant="dot-label"
                      >
                        {statusLabels[invitation.status]}
                      </IdentityBadge>
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
                          pending={
                            pendingAction?.kind === 'revoke' &&
                            pendingAction?.invitationId === invitation.invitationId &&
                            pending
                          }
                          pendingLabel="폐기 중"
                          aria-label={`${invitation.label} 코드 폐기`}
                          onClick={() => handleRevoke(invitation.invitationId, invitation.label)}
                        >
                          <XCircle aria-hidden="true" /> 폐기
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      </div>
    </WorkspaceShell>
  );
}
