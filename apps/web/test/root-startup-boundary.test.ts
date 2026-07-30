import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const rootUrl = new URL('../src/pages/root/ui/root.tsx', import.meta.url);
const authenticatedUrl = new URL('../src/routes/_authenticated.tsx', import.meta.url);
const authFieldUrl = new URL('../src/pages/auth/auth-input-field.tsx', import.meta.url);
const authCssUrl = new URL('../src/pages/auth/auth-page.module.css', import.meta.url);
const buttonUrl = new URL('../src/shared/ui/primitives/button.tsx', import.meta.url);
const fieldHaloUrl = new URL('../src/shared/ui/primitives/field-motion-halo.tsx', import.meta.url);
const linkUrl = new URL('../src/shared/ui/primitives/link.tsx', import.meta.url);
const loginPageUrl = new URL('../src/pages/auth/login-page.tsx', import.meta.url);
const signupPageUrl = new URL('../src/pages/auth/signup-page.tsx', import.meta.url);
// Path updated by the workspace route split: the shared route body moved from
// routes/_authenticated/workspace.tsx (one route, ?view= param) to
// pages/research-workspace/ui/workspace-view-route.tsx, which every per-tab
// route now renders. The assertions below are unchanged.
const workspaceRouteUrl = new URL(
  '../src/pages/research-workspace/ui/workspace-view-route.tsx',
  import.meta.url,
);
const workspaceLayoutUrl = new URL('../src/routes/_authenticated/workspace.tsx', import.meta.url);
const deferredHostUrl = new URL('../src/shared/ui/toast/deferred-toast-host.tsx', import.meta.url);
const notifyUrl = new URL('../src/shared/ui/toast/notify.ts', import.meta.url);
const motionToastUrl = new URL('../src/shared/ui/toast/motion-toast.tsx', import.meta.url);

async function read(url: URL) {
  return readFile(url, 'utf8');
}

describe('public root startup boundary', () => {
  it('keeps delegated Motion interaction ownership behind the authenticated route', async () => {
    const [root, authenticated] = await Promise.all([read(rootUrl), read(authenticatedUrl)]);

    assert.doesNotMatch(root, /InteractionMotionProvider|interaction-motion/);
    assert.match(authenticated, /InteractionMotionProvider/);
    assert.match(authenticated, /<InteractionMotionProvider>[\s\S]*?<Outlet \/>/);
  });

  it('loads Sonner and toast Motion only after a notification activates the host', async () => {
    const [root, deferredHost, notify, motionToast] = await Promise.all([
      read(rootUrl),
      read(deferredHostUrl),
      read(notifyUrl),
      read(motionToastUrl),
    ]);

    assert.match(root, /DeferredToastHost/);
    assert.doesNotMatch(root, /AppToaster|motion-toast/);
    assert.match(deferredHost, /lazy\(\(\) =>\s*import\('\.\/motion-toast'\)/);
    assert.match(deferredHost, /app-toast-activate/);
    assert.match(notify, /import\('\.\/motion-toast'\)/);
    assert.match(notify, /app-toast-activate/);
    assert.match(notify, /await waitForToastHost\(\)/);
    assert.match(motionToast, /app-toast-ready/);
    assert.doesNotMatch(notify, /from ['"](?:sonner|motion\/react|gsap|@gsap\/react)['"]/);
  });

  it('keeps public auth controls and halo free of the side-effectful primitive barrel', async () => {
    const [authField, loginPage, signupPage] = await Promise.all([
      read(authFieldUrl),
      read(loginPageUrl),
      read(signupPageUrl),
    ]);

    assert.doesNotMatch(authField, /useFieldShellMotion|primitives\/form/);
    assert.match(authField, /field-motion-halo/);
    assert.doesNotMatch(loginPage + signupPage, /from ['"]@\/shared\/ui\/primitives['"]/);
    assert.match(loginPage, /primitives\/button/);
    assert.match(loginPage, /primitives\/link/);
    assert.match(signupPage, /primitives\/button/);
    assert.match(signupPage, /primitives\/link/);
  });

  it('keeps workspace initial and local error fallbacks free of the side-effectful primitive barrel', async () => {
    // After the tab split the error fallback lives in the workspace LAYOUT route
    // and the view body in workspace-view-route; the barrel-import ban applies to
    // both, while the direct button import belongs to the fallback.
    const [workspaceLayout, workspaceRoute] = await Promise.all([
      read(workspaceLayoutUrl),
      read(workspaceRouteUrl),
    ]);

    for (const source of [workspaceLayout, workspaceRoute]) {
      assert.doesNotMatch(source, /from ['"]@\/shared\/ui\/primitives['"]/);
      assert.doesNotMatch(source, /WorkspaceRoutePending/);
    }
    assert.match(workspaceLayout, /primitives\/button/);
    assert.match(workspaceLayout, /primitives\/feedback/);
    assert.match(workspaceLayout, /<ErrorState\b/);
    assert.match(workspaceRoute, /viewLoadError/);
  });

  it('ships only dedicated control CSS to the public auth route', async () => {
    const [button, fieldHalo, link] = await Promise.all([
      read(buttonUrl),
      read(fieldHaloUrl),
      read(linkUrl),
    ]);
    const publicPrimitives = `${button}\n${fieldHalo}\n${link}`;

    assert.doesNotMatch(publicPrimitives, /primitives\.module\.css/);
    assert.match(
      await read(authCssUrl),
      /@media \(forced-colors: active\)[\s\S]*?\.authInput:focus-visible[\s\S]*?outline:\s*2px solid Highlight !important/,
    );
    assert.match(button, /button\.module\.css/);
    assert.match(fieldHalo, /field-motion-halo\.module\.css/);
    assert.match(link, /link\.module\.css/);
  });

  it('contains the shared public auth card style and paint work', async () => {
    const authCss = await read(authCssUrl);

    assert.match(authCss, /\.authCard\s*\{[^}]*contain:\s*layout paint style/s);
    assert.doesNotMatch(authCss, /loginVisualPanel|loginFormPanel/);
  });
});
