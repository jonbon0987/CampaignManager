import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

// ─── Guardrail selectors ────────────────────────────────────────────────────
// One list, because `no-restricted-syntax` is a single rule: a second config
// block that sets it again REPLACES the first instead of adding to it.

const BUTTON_MESSAGE =
  "Use <Button>/<IconButton> from components/ui instead of a styled raw <button>. Bespoke control? Add an eslint-disable-next-line with a reason."

// Audit F10 — unchanged from the August handoff.
const rawButtonSelectors = [
  {
    selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='className']",
    message: BUTTON_MESSAGE,
  },
  {
    selector: "JSXOpeningElement[name.name='button'] > JSXAttribute[name.name='style']",
    message: BUTTON_MESSAGE,
  },
]

// v5: audit I6 — a click handler on an element the keyboard cannot reach.
// Backdrops and stop-propagation wrappers are legitimate: suppress those with
//   // eslint-disable-next-line no-restricted-syntax -- backdrop; Escape closes
const deadClickSelectors = [
  {
    // An element that also handles keys (directly, or in a spread used when the
    // click is conditional) has been made keyboard-reachable on purpose.
    selector:
      "JSXOpeningElement[name.name=/^(div|span|li|tr|td|p|article|section)$/]" +
      ":not(:has(> JSXAttribute[name.name='onKeyDown']))" +
      ":not(:has(JSXSpreadAttribute Property[key.name='onKeyDown']))" +   // esquery: a multi-step :has must not start with '>'
      " > JSXAttribute[name.name='onClick']",
    message:
      "onClick on a non-interactive element is unreachable by keyboard. Use a <button>, <a> or <Button>. Backdrop or stopPropagation wrapper? Add an eslint-disable-next-line with a reason.",
  },
]

// v5: audit M3 — raw form controls. NOT enabled yet: spread this into the
// rule below when the Input / Select / Textarea primitives land, at 'warn' first.
const rawFieldSelectors = [
  {
    selector: "JSXOpeningElement[name.name=/^(input|select|textarea)$/] > JSXAttribute[name.name='style']",
    message:
      "Use <Input>/<Select>/<Textarea> from components/ui instead of a raw control styled inline. Checkbox, radio, range or file input? Add an eslint-disable-next-line with a reason.",
  },
]

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // v5: `_name` marks a deliberately unused parameter (lib/moduleUtils.ts:114).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // v5: a hot-reload nicety, not a correctness rule. It accounts for 29 of
      // the 43 errors on main. Demoted so CI can go green on day one; the 21
      // that are not context files go away as constants move to lib/theme.ts.
      // Promote back to 'error' after that.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // v5: React Compiler diagnostics, 7 sites on main. These are real, but
      // each needs a considered refactor rather than a mechanical fix:
      //   set-state-in-effect  tabs/EncounterBuilder.tsx:130 · ui/EncounterDetail.tsx:232
      //                        ui/SearchableSelect.tsx:47, 53
      //   immutability         tabs/RandomEncounters.tsx:40 (two)
      //   refs                 tabs/moduleDetail/SceneEditor.tsx:55
      // Demoted so they stay visible without blocking. Promote to 'error' as
      // each file is cleaned up.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
    },
  },

  // v5: a context file exports its Provider and its hook together by design.
  // The per-hook `eslint-disable … react-refresh` comments this made redundant
  // were removed.
  {
    files: ['src/context/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // ─── Guardrails for feature code ──────────────────────────────────────────
  // Everything outside the ui/ primitives.
  //
  // Both are errors since v5 phase 4d: every remaining site was converted or
  // carries an eslint-disable-next-line with its reason. New code must use the
  // ui primitives, or say why not.
  {
    files: ['src/**/*.tsx'],
    ignores: [
      'src/components/ui/**',   // Button, IconButton and the other primitives live here
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...rawButtonSelectors,
        ...deadClickSelectors,
        // ...rawFieldSelectors,   // v5: enable with the form primitives
      ],
    },
  },
])
