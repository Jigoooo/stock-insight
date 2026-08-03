import { createRef, type AnimationEventHandler, type DragEventHandler } from 'react';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb';
import { Button, IconButton } from '@/shared/ui/button';
import { ButtonGroup } from '@/shared/ui/button-group';
import { Calendar } from '@/shared/ui/calendar';
import { DatePicker, RangePicker } from '@/shared/ui/date-picker';
import { Dropzone, FileUpload } from '@/shared/ui/file-upload';
import { Input } from '@/shared/ui/input';
import { TextLink } from '@/shared/ui/link';
import { OTP } from '@/shared/ui/otp';
import {
  CursorPagination,
  CursorPaginationAction,
  CursorPaginationMessage,
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  PaginationStatus,
} from '@/shared/ui/pagination';
import { RadioGroup } from '@/shared/ui/radio-group';
import { RouteTab, RouteTabs } from '@/shared/ui/route-tabs';
import { Select } from '@/shared/ui/select';
import { SideList, SideListItem } from '@/shared/ui/side-list';
import {
  SideTabs,
  SideTabsContent,
  SideTabsContents,
  SideTabsHighlight,
  SideTabsHighlightItem,
  SideTabsList,
  SideTabsTrigger,
} from '@/shared/ui/side-tabs';
import { Slider } from '@/shared/ui/slider';
import { SplitButton } from '@/shared/ui/split-button';
import { Switch } from '@/shared/ui/switch';
import { Tabs, TabsHighlight, TabsHighlightItem, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { ToggleGroup } from '@/shared/ui/toggle-group';

const buttonDrag: DragEventHandler<HTMLButtonElement> = () => undefined;
const buttonAnimationStart: AnimationEventHandler<HTMLButtonElement> = () => undefined;
const groupDrag: DragEventHandler<HTMLDivElement> = () => undefined;
const groupAnimationStart: AnimationEventHandler<HTMLDivElement> = () => undefined;
const anchorDrag: DragEventHandler<HTMLAnchorElement> = () => undefined;
const anchorAnimationStart: AnimationEventHandler<HTMLAnchorElement> = () => undefined;

export const nativeControlPropsFixture = (
  <>
    <Input
      ref={createRef<HTMLInputElement>()}
      autoComplete="username"
      id="fixture-input"
      name="username"
      type="text"
    />
    <Button draggable onAnimationStart={buttonAnimationStart} onDrag={buttonDrag}>
      Button
    </Button>
    <IconButton
      aria-label="Icon button"
      draggable
      onAnimationStart={buttonAnimationStart}
      onDrag={buttonDrag}
    >
      I
    </IconButton>
    <ButtonGroup aria-label="Fixture actions" orientation="vertical" variant="inset">
      <Button>First action</Button>
      <Button pending pendingLabel="Running">
        Second action
      </Button>
    </ButtonGroup>
    <SplitButton
      actions={[
        { label: 'Download', value: 'download' },
        { disabled: true, label: 'Archived action', value: 'archive' },
      ]}
      disableMenuWhilePending
      onActionSelect={() => undefined}
      onOpenChange={() => undefined}
      triggerLabel="Fixture alternatives"
      variant="twin"
    >
      Primary action
    </SplitButton>
    <Switch
      checked={false}
      draggable
      label="Switch"
      onAnimationStart={buttonAnimationStart}
      onCheckedChange={() => undefined}
      onDrag={buttonDrag}
    />
    <RadioGroup
      aria-label="Research scope"
      items={[
        { label: 'Holdings', value: 'holding' },
        { description: 'Watched names', label: 'Watchlist', value: 'watch' },
      ]}
      onValueChange={() => undefined}
      value="watch"
      variant="rail"
    />
    <Slider
      aria-label="Confidence threshold"
      endLabel="Strict"
      onValueChange={() => undefined}
      startLabel="Broad"
      thumbLabels={['Confidence threshold']}
      value={[64]}
      variant="inset"
    />
    <Calendar
      defaultMonth={new Date(2026, 7, 1)}
      defaultValue={new Date(2026, 7, 12)}
      onValueChange={() => undefined}
      variant="ledger"
    />
    <DatePicker
      defaultValue={new Date(2026, 7, 2)}
      label="기준일"
      onValueChange={() => undefined}
      variant="inset"
    />
    <RangePicker
      defaultValue={{ from: new Date(2026, 7, 2), to: new Date(2026, 7, 16) }}
      endLabel="종료일"
      onValueChange={() => undefined}
      startLabel="시작일"
      variant="rail"
    />
    <FileUpload
      accept=".csv,.xlsx,.pdf"
      defaultFiles={[{ id: 'report', name: 'report.csv', size: 284 * 1024 }]}
      mode="multiple"
      onFilesChange={() => undefined}
      onReject={() => undefined}
      variant="inset"
    />
    <Dropzone
      accept=".csv,.xlsx,.pdf"
      filled
      mode="single"
      onFilesSelected={() => undefined}
      variant="hairline"
    />
    <OTP
      defaultValue="47"
      label="Verification code"
      name="verificationCode"
      onComplete={() => undefined}
      onValueChange={() => undefined}
      variant="rail"
    />
    <ToggleGroup
      draggable
      items={[{ label: 'Toggle', value: 'toggle' }]}
      onAnimationStart={groupAnimationStart}
      onDrag={groupDrag}
      onValueChange={() => undefined}
      value=""
    />
    <RouteTabs aria-label="Research routes" variant="hairline">
      <RouteTab active href="/overview">
        Overview
      </RouteTab>
      <RouteTab href="/evidence">Evidence</RouteTab>
    </RouteTabs>
    <RouteTabs aria-label="Compact routes" variant="quiet-surface">
      <RouteTab active href="/today">
        Today
      </RouteTab>
      <RouteTab href="/history">History</RouteTab>
    </RouteTabs>
    <Breadcrumb aria-label="Fixture breadcrumb" variant="soft-inset">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/overview">Overview</BreadcrumbLink>
          <BreadcrumbSeparator />
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
          <BreadcrumbSeparator />
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <button type="button">Evidence</button>
          </BreadcrumbLink>
          <BreadcrumbSeparator />
        </BreadcrumbItem>
        <BreadcrumbItem>
          <BreadcrumbPage>Detail</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <Pagination aria-label="Fixture pages" variant="soft-inset">
      <PaginationList>
        <PaginationItem>
          <PaginationPrevious asChild disabled>
            <a href="/page/0" onClick={() => undefined}>
              Previous
            </a>
          </PaginationPrevious>
        </PaginationItem>
        <PaginationItem>
          <PaginationLink asChild current>
            <button type="button">1</button>
          </PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis>
            <Select
              aria-label="Jump to page"
              onValueChange={() => undefined}
              options={[{ label: 'Page 2', value: '2' }]}
              placeholder="…"
              popupMinWidth={120}
              value=""
            />
          </PaginationEllipsis>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext asChild aria-disabled="true">
            <button onClick={() => undefined} type="button">
              Next
            </button>
          </PaginationNext>
        </PaginationItem>
      </PaginationList>
      <PaginationStatus>01 / 12</PaginationStatus>
    </Pagination>
    <CursorPagination>
      <CursorPaginationMessage>More records are available.</CursorPaginationMessage>
      <CursorPaginationAction asChild disabled>
        <a href="/cursor/next" onClick={() => undefined}>
          Load more
        </a>
      </CursorPaginationAction>
    </CursorPagination>
    <Tabs defaultValue="impact" fullWidth variant="soft-inset">
      <TabsHighlight>
        <TabsList aria-label="Impact views">
          <TabsHighlightItem value="impact">
            <TabsTrigger value="impact">Impact</TabsTrigger>
          </TabsHighlightItem>
          <TabsHighlightItem value="risks">
            <TabsTrigger value="risks">Risks</TabsTrigger>
          </TabsHighlightItem>
        </TabsList>
      </TabsHighlight>
    </Tabs>
    <Tabs defaultValue="market" variant="sliding-underline">
      <TabsHighlight>
        <TabsList aria-label="Market views">
          <TabsHighlightItem value="market">
            <TabsTrigger value="market">Market</TabsTrigger>
          </TabsHighlightItem>
          <TabsHighlightItem value="themes">
            <TabsTrigger value="themes">Themes</TabsTrigger>
          </TabsHighlightItem>
        </TabsList>
      </TabsHighlight>
    </Tabs>
    {(['hairline-rail', 'soft-inset', 'framed-stack'] as const).map((variant) => (
      <SideTabs defaultValue="summary" key={variant} variant={variant}>
        <SideTabsHighlight>
          <SideTabsList aria-label={`${variant} panels`}>
            <SideTabsHighlightItem value="summary">
              <SideTabsTrigger value="summary">Summary</SideTabsTrigger>
            </SideTabsHighlightItem>
            <SideTabsHighlightItem value="evidence">
              <SideTabsTrigger disabled value="evidence">
                Evidence
              </SideTabsTrigger>
            </SideTabsHighlightItem>
          </SideTabsList>
        </SideTabsHighlight>
        <SideTabsContents>
          <SideTabsContent value="summary">Summary content</SideTabsContent>
          <SideTabsContent value="evidence">Evidence content</SideTabsContent>
        </SideTabsContents>
      </SideTabs>
    ))}
    {(['quiet-rows', 'soft-surface', 'compact-rail'] as const).map((variant) => (
      <SideList aria-label={`${variant} routes`} key={variant} value="overview" variant={variant}>
        <SideListItem value="overview">
          <a href="/overview">Overview</a>
        </SideListItem>
        <SideListItem pending value="evidence">
          <a href="/evidence">Evidence</a>
        </SideListItem>
        <SideListItem disabled static value="archive">
          <span>Archive</span>
        </SideListItem>
      </SideList>
    ))}
    <TextLink
      draggable
      href="/native-link"
      onAnimationStart={anchorAnimationStart}
      onDrag={anchorDrag}
    >
      Link
    </TextLink>
  </>
);
