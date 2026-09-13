import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// Testing Library normally wires this up itself when the test globals are
// on, but this project's Vitest config keeps explicit `import { test } from
// 'vitest'` style (no `test.globals`), so cleanup needs to be registered by
// hand - otherwise each component test's markup piles up in the jsdom
// `document.body` left behind by the previous test in the same file.
afterEach(cleanup)
