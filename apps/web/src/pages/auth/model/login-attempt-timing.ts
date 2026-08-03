export const loginFailureMinimumPendingMs = 420;

type LoginFailureTimingOptions = {
  now?: () => number;
  wait?: (delayMs: number) => Promise<void>;
};

const waitFor = (delayMs: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs);
  });

export async function holdLoginFailureFeedback(
  startedAt: number,
  { now = () => performance.now(), wait = waitFor }: LoginFailureTimingOptions = {},
) {
  const remainingMs = loginFailureMinimumPendingMs - (now() - startedAt);
  if (remainingMs > 0) await wait(remainingMs);
}
