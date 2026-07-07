# Futur Insight Design System

## Reference Basis

- Linear: dark work-tool shell, low radius, restrained accent, product-first AI positioning.
  Source: https://linear.app/
- Hex: data/analytics product with compact spacing, small radius, custom typography, notebook-like density.
  Source: https://hex.tech/
- OpenBB: financial workspace with dark technical chrome, square controls, cyan accent, no decorative AI chrome.
  Source: https://openbb.co/
- Perplexity and Claude: AI products that keep the app surface quiet, search/task focused, and mostly typographic.
  Sources: https://www.perplexity.ai/ and https://claude.ai/
- MindStudio design-system article: generic AI UI often comes from default sans fonts, indigo accents, rounded cards, gradient hero sections, icon sidebars, and excessive padding.
  Source: https://www.mindstudio.ai/blog/claude-design-avoid-ai-slop-design-system
- React Bits: useful as a reference for copied-in micro-patterns such as active-edge emphasis and restrained data-context motion, not as a dependency source.
  Source: https://www.reactbits.dev/
- Magic UI and 21st.dev: useful as a cautionary reference for animated showcase components; avoid importing their landing-page visual intensity into the product shell.
  Sources: https://magicui.design/ and https://21st.dev/
- GSAP docs: use `useGSAP`, stagger, timeline-level cleanup, and conservative power/sine easing only where CSS transitions are insufficient.
  Source: https://gsap.com/docs/v3/
- MDN and web.dev: prefer explicit CSS transition properties, avoid animating `auto`, and respect `prefers-reduced-motion` in both CSS and JavaScript.
  Sources: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transitions/Using_CSS_transitions and https://web.dev/articles/prefers-reduced-motion

## Product Tone

Futur Insight should feel like a read-only investment research workspace, not a generated dashboard or AI assistant landing page. The interface should prioritize scan density, neutral structure, restrained color, and tabular precision.

## Non-Negotiables

- No marketing-style hero section as the first visual object.
- No decorative gradients, glow, glass, floating orbs, oversized icon tiles, or card-heavy showcase layout.
- No pill/chip sprawl. Status metadata may exist, but it should read like small system text, not colorful badges.
- No warm cream/beige dominant theme. Use a cool neutral work surface with graphite chrome.
- No large rounded cards. Default radius is 4-8px.
- No raw hardcoded colors outside `apps/web/src/shared/theme/tokens.ts` or global CSS variables.
- No investment advice wording.

## Tokens

- Background: cool off-white `#f4f5f2`
- Surface: white `#ffffff`
- Subtle surface: `#f7f8f5`
- Graphite chrome: `#11171b`
- Primary accent: restrained teal `#0f6f8f`
- Positive: muted green `#32745f`
- Caution: copper `#9a5638`
- Signal: muted brass `#8a7337`

## Layout Rules

- First viewport is a workbench: search, compact policy metadata, briefing panel, exposure chart, metrics, and feed.
- Use panels for functional regions, not decorative cards.
- Keep headings modest inside tools: 19-25px for section titles, 13-14px for body and controls.
- Use left navigation as dark product chrome on desktop; use compact bottom navigation on mobile.
- Preserve independent scroll regions for stock list and detail.

## Component Rules

- Buttons are flat, 5px radius, 12px labels, no gradients.
- Status labels are transparent with 1px borders or plain text separators.
- Chart bars and meters use small radii and muted token colors.
- Icons are supportive, not decorative; avoid icon bubbles unless the icon identifies a row.
- Shadows are limited to subtle one-layer panel separation.

## Motion Rules

- Motion must support the work surface, not decorate it. No parallax, marquee, bouncing, glow loops, or scroll-jacking.
- Use CSS transitions for hover, focus, active, chart fill, and progress fill. Use GSAP only for section-level entrance where lifecycle cleanup matters.
- Section reveal is keyed to section changes, not search typing or every selected row change.
- Prefer 150-300ms motion with `power`/`sine`-like easing. Avoid linear motion and avoid transitions longer than 500ms.
- Animate transforms and opacity only when needed. Do not animate layout sizes or `auto`.
- Reduced motion keeps content visible and removes non-essential movement.
- Reference libraries may inspire micro-interactions, but no new UI or animation dependencies are allowed for this goal.

## Review Checklist

- Does the screen still look professional if every icon is removed?
- Is the first screen a tool surface rather than a landing hero?
- Are colors doing information work, not decoration?
- Are there fewer than three badge-like elements in the first viewport?
- Are type sizes smaller than a marketing page and large enough for scanning?
- Does mobile preserve dense but readable task flow without horizontal overflow?
