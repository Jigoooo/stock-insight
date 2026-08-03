import { useState } from 'react';

import styles from './completed-components-catalog.module.css';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/shared/ui/accordion';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { Combobox } from '@/shared/ui/combobox';
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
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Select, type SelectOption } from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectionHead,
} from '@/shared/ui/table';
import { Textarea } from '@/shared/ui/textarea';
import { notify } from '@/shared/ui/toast';
import { ToggleGroup } from '@/shared/ui/toggle-group';

const marketOptions: readonly SelectOption[] = [
  { label: '미국 주식', value: 'us', description: 'NYSE · NASDAQ' },
  { label: '한국 주식', value: 'kr', description: 'KOSPI · KOSDAQ' },
  { label: '가상자산', value: 'crypto', description: '준비 중', disabled: true },
];

const viewOptions = [
  { label: '요약', value: 'summary' },
  { label: '근거', value: 'evidence' },
  { label: '변화', value: 'change' },
] as const;

const tableRows = [
  { key: 'nvda', name: 'NVIDIA', symbol: 'NVDA', status: '관찰 중' },
  { key: 'msft', name: 'Microsoft', symbol: 'MSFT', status: '근거 확인' },
  { key: '005930', name: '삼성전자', symbol: '005930', status: '업데이트' },
] as const;

export function CompletedComponentsCatalog() {
  const [activeView, setActiveView] = useState('summary');
  const [selectedCard, setSelectedCard] = useState(false);

  return (
    <section className={styles.catalog} aria-labelledby="completed-components-title">
      <header className={styles.header}>
        <span>Approved shared UI</span>
        <h2 id="completed-components-title">확정 공용 컴포넌트</h2>
        <p>제품과 공용 API에서 사용하는 현재 상태를 한곳에서 직접 확인합니다.</p>
      </header>

      <div className={styles.grid}>
        <section className={styles.group} aria-labelledby="completed-input-title">
          <header>
            <h3 id="completed-input-title">Input · Textarea</h3>
            <p>기본 입력, 검색 밀도, 작성 영역</p>
          </header>
          <div className={styles.stack}>
            <Input aria-label="종목 코드" placeholder="종목 코드" />
            <Input aria-label="종목 검색" density="search" placeholder="종목 검색" />
            <Textarea
              aria-label="리서치 메모"
              footer={<span>자동 저장</span>}
              placeholder="확인할 근거를 기록하세요"
              rows={3}
              variant="editorial"
            />
          </div>
        </section>

        <section className={styles.group} aria-labelledby="completed-button-title">
          <header>
            <h3 id="completed-button-title">Button</h3>
            <p>기본 액션, 보조 액션, 위험 액션과 pending</p>
          </header>
          <div className={styles.wrap}>
            <Button variant="primary">저장</Button>
            <Button variant="secondary">세부정보</Button>
            <Button variant="outline">다시 시도</Button>
            <Button variant="ghost">취소</Button>
            <Button variant="danger">삭제</Button>
            <Button pending pendingLabel="불러오는 중">
              새로고침
            </Button>
          </div>
        </section>

        <section className={styles.group} aria-labelledby="completed-select-title">
          <header>
            <h3 id="completed-select-title">Select · Combobox</h3>
            <p>포털 목록과 검색 가능한 선택</p>
          </header>
          <div className={styles.stack}>
            <Select aria-label="시장 선택" defaultValue="us" options={marketOptions} />
            <Combobox aria-label="종목 선택" options={marketOptions} placeholder="시장 검색" />
          </div>
        </section>

        <section className={styles.group} aria-labelledby="completed-choice-title">
          <header>
            <h3 id="completed-choice-title">Checkbox · Switch · ToggleGroup</h3>
            <p>복수 선택, 이진 상태, 단일 보기 전환</p>
          </header>
          <div className={styles.choiceGrid}>
            <Checkbox defaultChecked label="실적 일정 포함" variant="plain" />
            <Checkbox label="공시만 보기" variant="inset" />
            <Checkbox defaultChecked label="근거 확인" variant="ledger" />
            <Switch defaultChecked label="시장 알림" variant="quiet" />
            <Switch label="변화 강조" variant="inset" />
          </div>
          <ToggleGroup
            aria-label="리서치 보기"
            items={viewOptions}
            value={activeView}
            onValueChange={setActiveView}
          />
        </section>

        <section className={styles.groupWide} aria-labelledby="completed-data-title">
          <header>
            <h3 id="completed-data-title">Accordion · Card · Table</h3>
            <p>정보 접기, 상태 카드, 선택 가능한 데이터 표</p>
          </header>
          <div className={styles.dataGrid}>
            <div className={styles.accordionStack}>
              <span>Single · Quiet</span>
              <section aria-label="단일 열기 Accordion">
                <Accordion collapsible defaultValue="risk" type="single" variant="editorial">
                  <AccordionItem value="risk">
                    <AccordionTrigger>확인할 리스크</AccordionTrigger>
                    <AccordionContent>수요 변화와 공급 제약을 함께 확인합니다.</AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="source">
                    <AccordionTrigger>연결된 근거</AccordionTrigger>
                    <AccordionContent>
                      공시와 시장 데이터를 기준 시점별로 비교합니다.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
            </div>
            <div className={styles.accordionStack}>
              <span>Multiple · Surface Hover</span>
              <section aria-label="복수 열기 Accordion">
                <Accordion type="multiple" variant="surface-hover">
                  <AccordionItem value="risk">
                    <AccordionTrigger>확인할 리스크</AccordionTrigger>
                    <AccordionContent>수요 변화와 공급 제약을 함께 확인합니다.</AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="source">
                    <AccordionTrigger>연결된 근거</AccordionTrigger>
                    <AccordionContent>
                      공시와 시장 데이터를 기준 시점별로 비교합니다.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </section>
            </div>
            <Card selected={selectedCard} variant="selectable" onSelectedChange={setSelectedCard}>
              <CardHeader>
                <CardTitle>시장 변화 요약</CardTitle>
                <CardDescription>선택 가능한 상태 카드</CardDescription>
              </CardHeader>
              <CardContent>AI 인프라 수요와 공급망 변화를 확인 중입니다.</CardContent>
            </Card>
          </div>
          <Table defaultSelectedKeys={['nvda']} selectionMode="multiple" surface="plain">
            <TableHeader>
              <TableRow>
                <TableSelectionHead />
                <TableHead>종목</TableHead>
                <TableHead>이름</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableRows.map((row) => (
                <TableRow key={row.key} rowKey={row.key} selectionLabel={`${row.name} 선택`}>
                  <TableCell>{row.symbol}</TableCell>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>

        <section className={styles.groupWide} aria-labelledby="completed-overlay-title">
          <header>
            <h3 id="completed-overlay-title">Dialog · AlertDialog · Toast</h3>
            <p>상세 정보, 결정 확인, Sonner 기반 커스텀 피드백</p>
          </header>
          <div className={styles.wrap}>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="secondary">Dialog 열기</Button>
              </DialogTrigger>
              <DialogContent composition="detail" size="sm">
                <DialogHeader>
                  <DialogTitle>근거 세부정보</DialogTitle>
                  <DialogDescription>선택한 변화의 기준 시점과 출처입니다.</DialogDescription>
                </DialogHeader>
                <DialogBody>공시와 시장 데이터를 같은 기준 시점으로 정렬했습니다.</DialogBody>
              </DialogContent>
            </Dialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">AlertDialog 열기</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>선택을 초기화할까요?</AlertDialogTitle>
                  <AlertDialogDescription>현재 비교 상태만 초기화됩니다.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogBody>저장된 리서치 데이터는 변경되지 않습니다.</AlertDialogBody>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction>초기화</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button
              variant="secondary"
              onClick={() =>
                void notify.success('업데이트를 반영했습니다', {
                  description: '최신 리서치 상태로 갱신했습니다.',
                })
              }
            >
              성공 Toast
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                void notify.error('요청을 완료하지 못했습니다', {
                  description: '잠시 후 다시 시도해 주세요.',
                })
              }
            >
              오류 Toast
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void notify.action('변경을 적용했습니다', {
                  description: '필요하면 이전 상태로 되돌릴 수 있습니다.',
                  action: { label: '되돌리기', onClick: () => undefined },
                })
              }
            >
              액션 Toast
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
