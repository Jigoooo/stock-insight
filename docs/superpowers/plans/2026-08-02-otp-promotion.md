# OTP shared UI promotion plan

## Scope

- Promote the approved `hairline`, `inset`, and `rail` OTP mockups into `shared/ui/otp`.
- Preserve the UI Lab as the product-independent fixture because the application has no numeric OTP use case.
- Do not replace the signup enrollment code: it is an opaque value up to 256 characters, not a fixed numeric OTP.

## Public contract

- Controlled and uncontrolled values through `value`, `defaultValue`, and `onValueChange`.
- Configurable length with a six-digit default.
- Numeric normalization, one-time-code autocomplete, paste distribution, automatic focus advance, and keyboard navigation.
- `disabled`, `invalid`, `pending`, `required`, form `name`, completion callback, label, meta, and status copy.
- Visual variants: `hairline`, `inset`, and ring-free `rail` underline focus.

## Verification

1. Lock the public rendering and interaction contract with UI Lab source and Playwright tests.
2. Confirm the tests fail against the page-owned mockup.
3. Implement the shared component and replace the UI Lab raw inputs.
4. Verify desktop and 390px behavior, reduced motion, paste, focus movement, and rail focus styling.
5. Run format, lint, typecheck, build, targeted tests, `git diff --check`, and `graphify update .`.
