import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const CPU_THROTTLE_RATE = 4;
const INPUT_FRAME_GATE_MS = 50;
const LOGIN_CRITICAL_TRANSFER_GATE_BYTES = 650 * 1024;
const FONT_LAYOUT_SHIFT_GATE = 0.02;
const STARTUP_LONG_TASK_GATE_MS = 330;
const STARTUP_SCRIPT_GATE_MS = 120;
const STARTUP_STYLE_LAYOUT_GATE_MS = 325;
const SYNTHETIC_USERNAME_KEYSTROKES = 'motionprobe';
const BASELINE_OUTPUT_DIR =
  process.env.PLAYWRIGHT_BASELINE_OUTPUT_DIR ?? '/tmp/stock-insight-motion-baseline';
const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE;

test.use({ trace: 'off', video: 'off' });

const WORKSPACE_SECTIONS = [
  'radar',
  'stocks',
  'themes',
  'research',
  'history',
  'status',
  'today',
] as const;
const WORKSPACE_LANES = ['must_know', 'for_you', 'explore'] as const;

type RuntimeStats = {
  consoleByType: Record<string, number>;
  pageErrors: number;
};

type WorkAttribution = {
  duration: number;
  name: string;
  sourceFunctionName: string;
  sourceURL: string;
};

type DurationPhases = {
  renderDuration: number;
  scriptDuration: number;
  styleAndLayoutDuration: number;
};

type DurationEntry = {
  attribution: WorkAttribution[];
  duration: number;
  phases: DurationPhases | null;
  startTime: number;
};

type LayoutShiftEntry = {
  hadRecentInput: boolean;
  startTime: number;
  value: number;
};

type ResourceEntry = {
  decodedBodySize: number;
  duration: number;
  encodedBodySize: number;
  initiatorType: string;
  name: string;
  transferSize: number;
};

type InputFrameEntry = {
  delta: number;
  eventTime: number;
};

type NavigationFrameEntry = {
  delta: number;
  target: string;
};

type BrowserProbeSnapshot = {
  inputFrames: InputFrameEntry[];
  layoutShifts: LayoutShiftEntry[];
  longAnimationFrames: DurationEntry[];
  longTasks: DurationEntry[];
  navigationFrames: NavigationFrameEntry[];
  observerFailures: string[];
  resourceObserverEntryCount: number;
  supportedEntryTypes: string[];
};

type BrowserSnapshot = {
  navigation: ResourceEntry | null;
  probe: BrowserProbeSnapshot;
  resources: ResourceEntry[];
};

type WorkspaceNavigationTarget =
  | { id: (typeof WORKSPACE_SECTIONS)[number]; kind: 'section' }
  | { id: (typeof WORKSPACE_LANES)[number]; kind: 'lane' };

const WORKSPACE_NAVIGATION_PLAN: readonly WorkspaceNavigationTarget[] = [
  ...WORKSPACE_SECTIONS.map((id) => ({ id, kind: 'section' as const })),
  ...WORKSPACE_LANES.map((id) => ({ id, kind: 'lane' as const })),
];

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function collectRuntimeStats(page: Page): RuntimeStats {
  const stats: RuntimeStats = { consoleByType: {}, pageErrors: 0 };
  page.on('console', (message) => {
    const type = message.type();
    stats.consoleByType[type] = (stats.consoleByType[type] ?? 0) + 1;
  });
  page.on('pageerror', () => {
    stats.pageErrors += 1;
  });
  return stats;
}

async function installBrowserProbe(page: Page) {
  await page.addInitScript(() => {
    const probe = {
      inputFrames: [] as InputFrameEntry[],
      layoutShifts: [] as LayoutShiftEntry[],
      longAnimationFrames: [] as DurationEntry[],
      longTasks: [] as DurationEntry[],
      navigationFrames: [] as NavigationFrameEntry[],
      observerFailures: [] as string[],
      resourceEntries: [] as ResourceEntry[],
      supportedEntryTypes: [...(PerformanceObserver.supportedEntryTypes ?? [])],
    };
    const observers: PerformanceObserver[] = [];
    const supported = new Set(probe.supportedEntryTypes);

    Object.defineProperty(window, '__task0MotionProbe', {
      configurable: false,
      enumerable: false,
      value: probe,
    });
    Object.defineProperty(window, '__task0MotionObservers', {
      configurable: false,
      enumerable: false,
      value: observers,
    });

    const observe = (entryType: string, consume: (entry: PerformanceEntry) => void) => {
      if (!supported.has(entryType)) return;
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) consume(entry);
        });
        observer.observe({ buffered: true, type: entryType });
        observers.push(observer);
      } catch {
        probe.observerFailures.push(entryType);
      }
    };

    observe('longtask', (entry) => {
      const longTask = entry as PerformanceEntry & {
        attribution?: Array<{
          containerId?: string;
          containerName?: string;
          containerSrc?: string;
          containerType?: string;
          name?: string;
        }>;
      };
      probe.longTasks.push({
        attribution: (longTask.attribution ?? []).map((item) => ({
          duration: 0,
          name: item.name ?? item.containerType ?? item.containerName ?? item.containerId ?? '',
          sourceFunctionName: '',
          sourceURL: item.containerSrc ?? '',
        })),
        duration: entry.duration,
        phases: null,
        startTime: entry.startTime,
      });
    });
    observe('layout-shift', (entry) => {
      const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
      probe.layoutShifts.push({
        hadRecentInput: Boolean(shift.hadRecentInput),
        startTime: shift.startTime,
        value: shift.value ?? 0,
      });
    });
    observe('long-animation-frame', (entry) => {
      const frame = entry as PerformanceEntry & {
        renderStart?: number;
        scripts?: Array<{
          duration?: number;
          invoker?: string;
          invokerType?: string;
          sourceFunctionName?: string;
          sourceURL?: string;
        }>;
        styleAndLayoutStart?: number;
      };
      const endTime = entry.startTime + entry.duration;
      const renderStart = frame.renderStart ?? endTime;
      const scripts = frame.scripts ?? [];
      const styleAndLayoutStart = frame.styleAndLayoutStart ?? endTime;
      probe.longAnimationFrames.push({
        attribution: scripts.map((script) => ({
          duration: script.duration ?? 0,
          name: script.invoker ?? script.invokerType ?? '',
          sourceFunctionName: script.sourceFunctionName ?? '',
          sourceURL: script.sourceURL ?? '',
        })),
        duration: entry.duration,
        phases: {
          renderDuration: Math.max(0, endTime - renderStart),
          scriptDuration: scripts.reduce((total, script) => total + (script.duration ?? 0), 0),
          styleAndLayoutDuration: Math.max(0, endTime - styleAndLayoutStart),
        },
        startTime: entry.startTime,
      });
    });
    observe('resource', (entry) => {
      const resource = entry as PerformanceResourceTiming;
      probe.resourceEntries.push({
        decodedBodySize: resource.decodedBodySize,
        duration: resource.duration,
        encodedBodySize: resource.encodedBodySize,
        initiatorType: resource.initiatorType || 'other',
        name: resource.name,
        transferSize: resource.transferSize,
      });
    });

    document.addEventListener(
      'input',
      (event) => {
        if (!(event.target instanceof HTMLInputElement) || event.target.id !== 'login-username')
          return;
        const eventTime = event.timeStamp > 0 ? event.timeStamp : performance.now();
        requestAnimationFrame((frameTime) => {
          probe.inputFrames.push({ delta: Math.max(0, frameTime - eventTime), eventTime });
        });
      },
      true,
    );

    document.addEventListener(
      'click',
      (event) => {
        if (!(event.target instanceof Element)) return;
        const target = event.target.closest<HTMLElement>(
          '[data-testid^="workspace-nav-"], [id^="lane-tab-"]',
        );
        if (!target) return;
        const safeTarget = target.dataset.testid ?? target.id;
        const eventTime = event.timeStamp > 0 ? event.timeStamp : performance.now();
        requestAnimationFrame((frameTime) => {
          probe.navigationFrames.push({
            delta: Math.max(0, frameTime - eventTime),
            target: safeTarget,
          });
        });
      },
      true,
    );
  });
}

async function readBrowserSnapshot(page: Page): Promise<BrowserSnapshot> {
  return page.evaluate(() => {
    const probe = (
      window as Window & {
        __task0MotionProbe?: {
          inputFrames: InputFrameEntry[];
          layoutShifts: LayoutShiftEntry[];
          longAnimationFrames: DurationEntry[];
          longTasks: DurationEntry[];
          navigationFrames: NavigationFrameEntry[];
          observerFailures: string[];
          resourceEntries: ResourceEntry[];
          supportedEntryTypes: string[];
        };
      }
    ).__task0MotionProbe;
    if (!probe) throw new Error('Task 0 browser probe was not installed');

    const serializeResource = (entry: PerformanceResourceTiming): ResourceEntry => ({
      decodedBodySize: entry.decodedBodySize,
      duration: entry.duration,
      encodedBodySize: entry.encodedBodySize,
      initiatorType: entry.initiatorType || 'other',
      name: entry.name,
      transferSize: entry.transferSize,
    });
    const navigation = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;

    return {
      navigation: navigation
        ? {
            decodedBodySize: navigation.decodedBodySize,
            duration: navigation.duration,
            encodedBodySize: navigation.encodedBodySize,
            initiatorType: 'navigation',
            name: navigation.name,
            transferSize: navigation.transferSize,
          }
        : null,
      probe: {
        inputFrames: [...probe.inputFrames],
        layoutShifts: [...probe.layoutShifts],
        longAnimationFrames: [...probe.longAnimationFrames],
        longTasks: [...probe.longTasks],
        navigationFrames: [...probe.navigationFrames],
        observerFailures: [...probe.observerFailures],
        resourceObserverEntryCount: probe.resourceEntries.length,
        supportedEntryTypes: [...probe.supportedEntryTypes],
      },
      resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map(
        serializeResource,
      ),
    };
  });
}

function summarizeDurations(entries: readonly DurationEntry[]) {
  const samplesMs = entries.map((entry) => round(entry.duration));
  const phaseSamples = entries.flatMap((entry) =>
    entry.phases
      ? [
          {
            renderMs: round(entry.phases.renderDuration),
            scriptMs: round(entry.phases.scriptDuration),
            styleAndLayoutMs: round(entry.phases.styleAndLayoutDuration),
          },
        ]
      : [],
  );
  const phaseTotals = phaseSamples.reduce(
    (totals, phase) => ({
      renderMs: round(totals.renderMs + phase.renderMs),
      scriptMs: round(totals.scriptMs + phase.scriptMs),
      styleAndLayoutMs: round(totals.styleAndLayoutMs + phase.styleAndLayoutMs),
    }),
    { renderMs: 0, scriptMs: 0, styleAndLayoutMs: 0 },
  );
  const phaseMaxima = phaseSamples.reduce(
    (maxima, phase) => ({
      renderMs: Math.max(maxima.renderMs, phase.renderMs),
      scriptMs: Math.max(maxima.scriptMs, phase.scriptMs),
      styleAndLayoutMs: Math.max(maxima.styleAndLayoutMs, phase.styleAndLayoutMs),
    }),
    { renderMs: 0, scriptMs: 0, styleAndLayoutMs: 0 },
  );
  const attributionBySource = new Map<
    string,
    {
      durationMs: number;
      name: string;
      occurrences: number;
      sourceFunctionName: string;
      sourceURL: string;
    }
  >();
  for (const item of entries.flatMap((entry) => entry.attribution)) {
    const sourceURL = item.sourceURL ? new URL(item.sourceURL).pathname : '';
    const key = `${sourceURL}|${item.sourceFunctionName}|${item.name}`;
    const current = attributionBySource.get(key) ?? {
      durationMs: 0,
      name: item.name,
      occurrences: 0,
      sourceFunctionName: item.sourceFunctionName,
      sourceURL,
    };
    current.durationMs += item.duration;
    current.occurrences += 1;
    attributionBySource.set(key, current);
  }
  const topAttribution = [...attributionBySource.values()]
    .map((item) => ({ ...item, durationMs: round(item.durationMs) }))
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 10);
  return {
    count: entries.length,
    maxMs: entries.length === 0 ? 0 : round(Math.max(...entries.map((entry) => entry.duration))),
    phaseMaxima,
    phaseSamples,
    phaseTotals,
    samplesMs,
    topAttribution,
    totalMs: round(entries.reduce((total, entry) => total + entry.duration, 0)),
  };
}

function summarizeInputFrames(entries: readonly InputFrameEntry[]) {
  if (entries.length === 0) throw new Error('No input-event to next-rAF samples were captured');
  const values = entries.map((entry) => entry.delta).sort((left, right) => left - right);
  const percentile = (ratio: number) =>
    values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)];
  return {
    count: values.length,
    maxMs: round(values.at(-1) ?? 0),
    meanMs: round(values.reduce((total, value) => total + value, 0) / values.length),
    minMs: round(values[0] ?? 0),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    samplesMs: values.map(round),
  };
}

function summarizeLayoutShifts(entries: readonly LayoutShiftEntry[]) {
  return {
    count: entries.length,
    cumulativeScore: round(
      entries
        .filter((entry) => !entry.hadRecentInput)
        .reduce((total, entry) => total + entry.value, 0),
    ),
    samples: entries.map((entry) => ({
      hadRecentInput: entry.hadRecentInput,
      startTimeMs: round(entry.startTime),
      value: round(entry.value),
    })),
  };
}

function summarizeTransfer(snapshot: BrowserSnapshot) {
  const byInitiator = new Map<
    string,
    { count: number; decodedBodyBytes: number; encodedBodyBytes: number; transferBytes: number }
  >();
  for (const resource of snapshot.resources) {
    const bucket = byInitiator.get(resource.initiatorType) ?? {
      count: 0,
      decodedBodyBytes: 0,
      encodedBodyBytes: 0,
      transferBytes: 0,
    };
    bucket.count += 1;
    bucket.decodedBodyBytes += resource.decodedBodySize;
    bucket.encodedBodyBytes += resource.encodedBodySize;
    bucket.transferBytes += resource.transferSize;
    byInitiator.set(resource.initiatorType, bucket);
  }

  const resourceTotals = snapshot.resources.reduce(
    (totals, resource) => ({
      decodedBodyBytes: totals.decodedBodyBytes + resource.decodedBodySize,
      encodedBodyBytes: totals.encodedBodyBytes + resource.encodedBodySize,
      transferBytes: totals.transferBytes + resource.transferSize,
    }),
    { decodedBodyBytes: 0, encodedBodyBytes: 0, transferBytes: 0 },
  );
  const largestResources = [...snapshot.resources]
    .sort((left, right) => right.transferSize - left.transferSize)
    .slice(0, 8)
    .map((resource) => ({
      durationMs: round(resource.duration),
      encodedBodyBytes: resource.encodedBodySize,
      initiatorType: resource.initiatorType,
      name: new URL(resource.name).pathname,
      transferBytes: resource.transferSize,
    }));

  return {
    byInitiator: Object.fromEntries(
      [...byInitiator.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
    largestResources,
    navigation: snapshot.navigation
      ? {
          decodedBodyBytes: snapshot.navigation.decodedBodySize,
          durationMs: round(snapshot.navigation.duration),
          encodedBodyBytes: snapshot.navigation.encodedBodySize,
          transferBytes: snapshot.navigation.transferSize,
        }
      : null,
    resourceCount: snapshot.resources.length,
    resourceObserverEntryCount: snapshot.probe.resourceObserverEntryCount,
    resourceTotals,
    totalTransferBytes: resourceTotals.transferBytes + (snapshot.navigation?.transferSize ?? 0),
  };
}

async function exercisePointerStates(target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await target.hover();
  const hovered = await target.evaluate((element) => element.matches(':hover'));
  const box = await target.boundingBox();
  if (!box) throw new Error('Pointer target does not have a bounding box');

  const mouse = target.page().mouse;
  await mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let mouseIsDown = false;
  try {
    await mouse.down();
    mouseIsDown = true;
    await target.page().waitForTimeout(80);
    const pressed = await target.evaluate((element) => element.matches(':active'));
    await mouse.move(0, 0, { steps: 2 });
    await mouse.up();
    mouseIsDown = false;
    return { hovered, pressed };
  } finally {
    if (mouseIsDown) await mouse.up();
  }
}

async function focusWithKeyboard(page: Page, target: Locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Keyboard tab sequence did not reach the username field');
}

async function readVisibleFocusRing(field: Locator) {
  await field.page().waitForTimeout(220);
  return field.evaluate((input: HTMLInputElement) => {
    const shell = input.closest<HTMLElement>('[data-motion="field-shell"]');
    if (!shell) throw new Error('Username field shell is missing');
    const inputStyle = getComputedStyle(input);
    const shellStyle = getComputedStyle(shell);
    const hasOutline = (style: CSSStyleDeclaration) =>
      style.outlineStyle !== 'none' &&
      style.outlineStyle !== 'hidden' &&
      Number.parseFloat(style.outlineWidth) > 0;
    const hasShadow = (style: CSSStyleDeclaration) => style.boxShadow !== 'none';
    const focusVisible = input.matches(':focus-visible');
    const source = {
      inputOutline: hasOutline(inputStyle),
      inputShadow: hasShadow(inputStyle),
      shellOutline: hasOutline(shellStyle),
      shellShadow: hasShadow(shellStyle),
    };
    return {
      focusVisible,
      ringVisible: focusVisible && Object.values(source).some(Boolean),
      source,
    };
  });
}

async function readHorizontalOverflow(page: Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    overflowPx: Math.max(
      0,
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

function runtimeSummary(stats: RuntimeStats) {
  const consoleByType = Object.fromEntries(
    Object.entries(stats.consoleByType).sort(([left], [right]) => left.localeCompare(right)),
  );
  return {
    consoleByType,
    consoleErrors: stats.consoleByType.error ?? 0,
    pageErrors: stats.pageErrors,
    totalErrors: (stats.consoleByType.error ?? 0) + stats.pageErrors,
  };
}

async function settlePerformanceObservers(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await mkdir(BASELINE_OUTPUT_DIR, { recursive: true });
  await writeFile(join(BASELINE_OUTPUT_DIR, `${name}.json`), body, 'utf8');
  await testInfo.attach(name, {
    body: Buffer.from(body, 'utf8'),
    contentType: 'application/json',
  });
}

async function setCpuThrottle(page: Page, rate: number): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate });
  return session;
}

async function resetCpuThrottle(session: CDPSession) {
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => undefined);
  await session.detach().catch(() => undefined);
}

async function activateWorkspaceTarget(
  page: Page,
  target: WorkspaceNavigationTarget,
  mobile: boolean,
) {
  const startedAt = await page.evaluate(() => performance.now());
  if (target.kind === 'section') {
    if (mobile) {
      const menuButton = page.getByRole('button', { name: '메뉴 열기' });
      if ((await menuButton.getAttribute('aria-expanded')) !== 'true') await menuButton.click();
    }
    await page.getByTestId(`workspace-nav-${target.id}`).click();
    await page.waitForURL(new RegExp(`[?&]view=${target.id}(?:&|$)`));
  } else {
    await page.locator(`#lane-tab-${target.id}`).click();
    await page.waitForURL(new RegExp(`[?&]lane=${target.id}(?:&|$)`));
  }
  const settledAt = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame((time) => resolve(time)));
      }),
  );
  return {
    elapsedToSecondFrameMs: round(settledAt - startedAt),
    id: target.id,
    kind: target.kind,
  };
}

async function runWorkspaceNavigationPlan(page: Page, mobile: boolean) {
  const actionTimings = [];
  for (const target of WORKSPACE_NAVIGATION_PLAN) {
    actionTimings.push(await activateWorkspaceTarget(page, target, mobile));
  }
  return {
    actionTimings,
    configuredLaneCount: WORKSPACE_LANES.length,
    configuredSectionCount: WORKSPACE_SECTIONS.length,
  };
}

test.describe('Task 0 public motion/performance baseline', () => {
  test('records the credential-free /login baseline under 4x CPU throttle', async ({
    page,
  }, testInfo) => {
    const runtime = collectRuntimeStats(page);
    await installBrowserProbe(page);
    const cdp = await setCpuThrottle(page, CPU_THROTTLE_RATE);

    try {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      const username = page.getByLabel('사용자 이름');
      const submit = page.getByRole('button', { name: '로그인', exact: true });
      await username.waitFor({ state: 'visible' });
      await submit.waitFor({ state: 'visible' });
      await page.waitForLoadState('networkidle');

      const pointer = await exercisePointerStates(submit);
      await focusWithKeyboard(page, username);
      const focusRing = await readVisibleFocusRing(username);
      const inputSampleStart = await page.evaluate(() => {
        const probe = (
          window as Window & { __task0MotionProbe?: { inputFrames: InputFrameEntry[] } }
        ).__task0MotionProbe;
        if (!probe) throw new Error('Task 0 browser probe was not installed');
        return probe.inputFrames.length;
      });

      await page.keyboard.type(SYNTHETIC_USERNAME_KEYSTROKES, { delay: 24 });
      await page.waitForFunction(
        ([start, expected]) => {
          const probe = (
            window as Window & { __task0MotionProbe?: { inputFrames: InputFrameEntry[] } }
          ).__task0MotionProbe;
          return Boolean(probe && probe.inputFrames.length >= start + expected);
        },
        [inputSampleStart, SYNTHETIC_USERNAME_KEYSTROKES.length] as const,
      );
      await settlePerformanceObservers(page);

      const [snapshot, overflow] = await Promise.all([
        readBrowserSnapshot(page),
        readHorizontalOverflow(page),
      ]);
      const inputFrames = summarizeInputFrames(snapshot.probe.inputFrames.slice(inputSampleStart));
      const runtimeMetrics = runtimeSummary(runtime);
      const baseline = {
        cpuThrottleRate: CPU_THROTTLE_RATE,
        gates: {
          focusedFieldVisibleRing: focusRing.ringVisible,
          horizontalOverflowLimitPx: 1,
          inputFrameMaxLimitMs: INPUT_FRAME_GATE_MS,
          runtimeErrorLimit: 0,
        },
        interactions: {
          focusRing,
          inputEventToNextAnimationFrame: inputFrames,
          pointer,
          syntheticKeystrokeCount: SYNTHETIC_USERNAME_KEYSTROKES.length,
        },
        layout: overflow,
        observers: {
          failures: snapshot.probe.observerFailures,
          supportedEntryTypes: snapshot.probe.supportedEntryTypes,
        },
        performance: {
          layoutShifts: summarizeLayoutShifts(snapshot.probe.layoutShifts),
          longAnimationFrames: summarizeDurations(snapshot.probe.longAnimationFrames),
          longTasks: summarizeDurations(snapshot.probe.longTasks),
        },
        project: testInfo.project.name,
        runtime: runtimeMetrics,
        schemaVersion: 1,
        surface: 'public-login',
        transfer: summarizeTransfer(snapshot),
        viewport: page.viewportSize(),
      };

      await attachJson(testInfo, `task-0-login-motion-baseline-${testInfo.project.name}`, baseline);

      expect(runtimeMetrics.totalErrors).toBe(0);
      expect(overflow.overflowPx).toBeLessThanOrEqual(1);
      expect(focusRing.ringVisible).toBe(true);
      expect(inputFrames.maxMs).toBeLessThan(INPUT_FRAME_GATE_MS);
      expect(baseline.performance.longTasks.maxMs).toBeLessThanOrEqual(STARTUP_LONG_TASK_GATE_MS);
      expect(baseline.performance.longAnimationFrames.phaseMaxima.scriptMs).toBeLessThanOrEqual(
        STARTUP_SCRIPT_GATE_MS,
      );
      expect(
        baseline.performance.longAnimationFrames.phaseMaxima.styleAndLayoutMs,
      ).toBeLessThanOrEqual(STARTUP_STYLE_LAYOUT_GATE_MS);
      expect(baseline.transfer.totalTransferBytes).toBeLessThanOrEqual(
        LOGIN_CRITICAL_TRANSFER_GATE_BYTES,
      );
      expect(baseline.performance.layoutShifts.cumulativeScore).toBeLessThanOrEqual(
        FONT_LAYOUT_SHIFT_GATE,
      );
    } finally {
      await resetCpuThrottle(cdp);
    }
  });
});

test.describe('Task 0 authenticated workspace baseline', () => {
  if (storageStatePath) test.use({ storageState: storageStatePath });

  test('records reusable 7-section/3-lane navigation timing scaffolding', async ({
    page,
  }, testInfo) => {
    test.skip(
      !storageStatePath,
      'PLAYWRIGHT_STORAGE_STATE is not set; authenticated /workspace baseline is explicitly skipped',
    );

    const runtime = collectRuntimeStats(page);
    await installBrowserProbe(page);
    await page.goto('/workspace?view=today&lane=must_know', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('research-workspace-v3').waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');

    const navigationPlan = await runWorkspaceNavigationPlan(
      page,
      testInfo.project.name === 'mobile',
    );
    await settlePerformanceObservers(page);
    const [snapshot, overflow] = await Promise.all([
      readBrowserSnapshot(page),
      readHorizontalOverflow(page),
    ]);
    const runtimeMetrics = runtimeSummary(runtime);
    const baseline = {
      layout: overflow,
      navigation: {
        ...navigationPlan,
        eventToNextAnimationFrame: snapshot.probe.navigationFrames.map((entry) => ({
          deltaMs: round(entry.delta),
          target: entry.target,
        })),
      },
      observers: {
        failures: snapshot.probe.observerFailures,
        supportedEntryTypes: snapshot.probe.supportedEntryTypes,
      },
      performance: {
        layoutShifts: summarizeLayoutShifts(snapshot.probe.layoutShifts),
        longAnimationFrames: summarizeDurations(snapshot.probe.longAnimationFrames),
        longTasks: summarizeDurations(snapshot.probe.longTasks),
      },
      project: testInfo.project.name,
      runtime: runtimeMetrics,
      schemaVersion: 1,
      surface: 'authenticated-workspace',
      transfer: summarizeTransfer(snapshot),
      viewport: page.viewportSize(),
    };

    await attachJson(
      testInfo,
      `task-0-workspace-motion-baseline-${testInfo.project.name}`,
      baseline,
    );

    expect(runtimeMetrics.totalErrors).toBe(0);
    expect(overflow.overflowPx).toBeLessThanOrEqual(1);
  });
});
