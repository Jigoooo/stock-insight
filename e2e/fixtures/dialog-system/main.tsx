import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import '../../../apps/web/public/styles/index.css';
import '../../../apps/web/public/styles/profiles/market-graphite.css';
import './fixture.css';

import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Dialog,
  DialogAction,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { ToggleGroup } from '@/shared/ui/toggle-group';

const roleOptions = [
  { value: 'viewer', label: '조회자' },
  { value: 'editor', label: '리서처' },
] as const;

function Fixture() {
  const [decision, setDecision] = useState('hold');
  const [selectedCard, setSelectedCard] = useState(false);

  return (
    <main className="fixture-shell">
      <p className="fixture-kicker">Shared overlay system</p>
      <h1>Dialog interaction fixture</h1>
      <div className="fixture-actions">
        <Dialog>
          <DialogTrigger asChild>
            <Button>Form Dialog 열기</Button>
          </DialogTrigger>
          <DialogContent composition="form" aria-label="리서치 설정">
            <DialogHeader>
              <DialogTitle>리서치 설정</DialogTitle>
              <DialogDescription>
                공용 입력 컴포넌트의 조합과 포커스 흐름을 확인합니다.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="fixture-form">
                <label htmlFor="research-name">이름</label>
                <Input id="research-name" placeholder="예: 반도체 주간 점검" />
                <span id="role-label">권한</span>
                <Select aria-labelledby="role-label" options={roleOptions} defaultValue="viewer" />
                <label htmlFor="research-note">메모</label>
                <Textarea id="research-note" placeholder="확인할 조건을 적어주세요." />
                <Checkbox label="시장 마감 알림 포함" />
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <DialogAction tone="secondary">취소</DialogAction>
              </DialogClose>
              <DialogClose asChild>
                <DialogAction tone="primary">저장</DialogAction>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">Decision Dialog 열기</Button>
          </DialogTrigger>
          <DialogContent composition="decision" aria-label="표시 방식 선택">
            <DialogHeader>
              <DialogTitle>표시 방식 선택</DialogTitle>
              <DialogDescription>공용 선택 컨트롤과 선택형 카드를 조합합니다.</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="fixture-decision">
                <ToggleGroup
                  items={[
                    { value: 'hold', label: '보류' },
                    { value: 'review', label: '검토' },
                  ]}
                  value={decision}
                  onValueChange={setDecision}
                />
                <Card
                  selected={selectedCard}
                  variant="selectable"
                  onSelectedChange={setSelectedCard}
                >
                  <CardTitle>관심 후보에 표시</CardTitle>
                  <CardDescription>오늘 리서치 목록 상단에서 다시 확인합니다.</CardDescription>
                  <CardContent>선택 상태는 카드 전체 클릭으로 전환됩니다.</CardContent>
                </Card>
              </div>
            </DialogBody>
            <DialogFooter>
              <DialogClose asChild>
                <DialogAction tone="primary">적용</DialogAction>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="danger">Alert 열기</Button>
          </AlertDialogTrigger>
          <AlertDialogContent aria-label="기록 삭제 확인">
            <AlertDialogHeader>
              <AlertDialogTitle>기록을 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogBody>저장된 리서치 메모 한 건이 영구적으로 삭제됩니다.</AlertDialogBody>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction tone="danger">삭제</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
