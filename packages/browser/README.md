# @fernohq/analytics-next

Ferno’s browser SDK helps you collect product analytics, identify users, track events, and capture opt-in browser instrumentation from web applications.

### Table of Contents

- [🏎️ Quickstart](#-quickstart)
  - [🔗 Segment compatibility](#-segment-compatibility)
  - [💻 Using as an `npm` package](#-using-as-an-npm-package)
- [🔌 Architecture](#-architecture--plugins)
- [🐒 Development](#-development)

---

# 🏎️ Quickstart

## Ferno

Use a Ferno project API key (`ferno_pk_...`) and send batched events to Ferno’s
`/events` endpoint.

```ts
import { AnalyticsBrowser } from '@fernohq/analytics-next'

const analytics = AnalyticsBrowser.load(
  {
    writeKey: 'ferno_pk_your_project_key',
    cdnSettings: {
      integrations: {
        'Segment.io': { apiKey: 'ferno_pk_your_project_key' },
      },
    },
  },
  {
    integrations: {
      'Segment.io': {
        apiHost: 'https://data.useferno.com',
        apiPath: '/events',
        authMode: 'bearer',
        deliveryStrategy: {
          strategy: 'batching',
          config: { size: 10, timeout: 5000 },
        },
      },
    },
  }
)
```

For local API development, use `apiHost: 'http://localhost:8080'`. Configure
the API's CORS allowlist for the browser origin.

You can [install it through npm](#-using-as-an-npm-package) and use the SDK
directly in your application.

## 🔗 Segment compatibility

The browser SDK retains Segment-compatible integration interfaces so existing
instrumentation can be routed to Ferno. The `Segment.io` integration name in
configuration is a compatibility identifier; it does not require a Segment
account when configured with Ferno’s API host and project key.

For additional details about the compatible browser API, see [Segment’s
JavaScript source documentation](https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/).

## 💻 Using as an `npm` package

1. Install the package

```sh
# npm
npm install @fernohq/analytics-next

# yarn
yarn add @fernohq/analytics-next

# pnpm
pnpm add @fernohq/analytics-next
```

2. Import the package into your project and you're good to go (with working types)!

```ts
import { AnalyticsBrowser } from '@fernohq/analytics-next'

const analytics = AnalyticsBrowser.load({ writeKey: '<YOUR_WRITE_KEY>' })

analytics.identify('hello world')

document.body?.addEventListener('click', () => {
  analytics.track('document body clicked!')
})
```

## Lazy / Delayed Loading
You can load a buffered version of the Ferno SDK that requires `.load` to be
explicitly called before initiating network activity. This is useful when you
need to wait for consent before sending buffered events.

- ⚠️ ️`.load` should only be called _once_.

```ts
export const analytics = new AnalyticsBrowser()

analytics.identify("hello world")

if (userConsentsToBeingTracked) {
    analytics.load({ writeKey: '<FERNO_PROJECT_API_KEY>' }) // buffered events are flushed
}
```
This strategy also comes in handy if you have some settings that are fetched asynchronously.
```ts
const analytics = new AnalyticsBrowser()
fetchWriteKey().then(writeKey => analytics.load({ writeKey }))

analytics.identify("hello world")
```
## Error Handling
### Handling initialization errors
Initialization errors get logged by default, but if you also want to catch these errors, you can do the following:
```ts
export const analytics = new AnalyticsBrowser();
analytics
  .load({ writeKey: "FERNO_PROJECT_API_KEY" })
  .catch((err) => ...);
```

## Custom CDN / API proxy

Configure `apiHost` and `apiPath` when routing Ferno traffic through a proxy.
For compatible proxy behavior, see [Segment’s custom proxy documentation](https://segment.com/docs/connections/sources/catalog/libraries/website/javascript/custom-proxy/#custom-cdn--api-proxy).

## Examples / Usage in Common Frameworks and SPAs

### Next.js
- https://nextjs.org/docs

### Vanilla React
```tsx
import { AnalyticsBrowser } from '@fernohq/analytics-next'

// We can export this instance to share with rest of our codebase.
export const analytics = AnalyticsBrowser.load({ writeKey: '<FERNO_PROJECT_API_KEY>' })

const App = () => (
  <div>
    <button onClick={() => analytics.track('hello world')}>Track</button>
  </div>
)
```



### Vue

1. Export analytics instance.

```ts
import { AnalyticsBrowser } from '@fernohq/analytics-next'

export const analytics = AnalyticsBrowser.load({
  writeKey: '<FERNO_PROJECT_API_KEY>',
})
```

2. in `.vue` component

```tsx
<template>
  <button @click="track()">Track</button>
</template>

<script>
import { defineComponent } from 'vue'
import { analytics } from './services/ferno'

export default defineComponent({
  setup() {
    function track() {
      analytics.track('Hello world')
    }

    return {
      track,
    }
  },
})
</script>
```

## Support for Web Workers (Experimental)
While this package does not support web workers out of the box, there are options:

1. Run the Ferno SDK in a web worker via [partytown.io](https://partytown.builder.io/). See [the Partytown example](../../playgrounds/next-playground/pages/partytown). **Support depends on the worker runtime and available browser APIs.**

2. Try [@fernohq/analytics-node](../node) with `flushAt: 1`, which works in runtimes where `fetch` is available. **Server-side delivery only.**




## How to add typescript support (snippet users only)

1. Install npm package `@fernohq/analytics-next` as a dev dependency.

2. Create `./typings/analytics.d.ts`
```ts
// ./typings/analytics.d.ts
import type { AnalyticsSnippet } from "@fernohq/analytics-next";

declare global {
  interface Window {
    analytics: AnalyticsSnippet;
  }
}

```
3. Configure typescript to read from the custom `./typings` folder
```jsonc
// tsconfig.json
{
  ...
  "compilerOptions": {
    ....
    "typeRoots": [
      "./node_modules/@types",
      "./typings"
    ]
  }
  ....
}
```

##  🔌 Architecture & Plugins
- See [ARCHITECTURE.md](architecture/ARCHITECTURE.md)

## 🐒 Development

First, clone the repo and then startup our local dev environment:

```sh
$ git clone https://github.com/fernohq/sdk.git
$ cd sdk
$ nvm use  # installs correct version of node defined in .nvmrc.
$ yarn && yarn build
$ yarn test
$ yarn dev  # optional: runs the Ferno playground.
```

> If you get "Cannot find module '@fernohq/analytics-next' or its corresponding type declarations.ts(2307)" (in VSCode), you may have to "cmd+shift+p -> "TypeScript: Restart TS server"

Then, make your changes and test them out in the test app!

<img src="https://user-images.githubusercontent.com/2866515/135407053-7561d522-b969-484d-8d3a-6f1c4d9c025b.gif" alt="Example of the development app" width="500px">



# Ferno instrumentation

The browser SDK keeps instrumentation opt-in. Configure it at load time:

```ts
AnalyticsBrowser.load({ writeKey }, {
  instrumentation: {
    autocapture: true,
    rageClicks: true,
    deadClicks: true,
    navigation: { enabled: true, hash: true },
    exceptions: { enabled: true, console: false },
    heatmaps: { enabled: true, flushInterval: 10000 },
  },
})
```

Generated event names are `autocapture`, `rage_click`, `dead_click`, `page_view`, `page_leave`, `exception`, and `heatmap`. All generated events use `track`; generated navigation events do not call `page`. Existing manual and initial pageviews remain authoritative.

Runtime controls are available on both `Analytics` and buffered `AnalyticsBrowser`: `startInstrumentation`, `stopInstrumentation`, and `start/stop` methods for autocapture, rage clicks, dead clicks, navigation, exceptions, and heatmaps. Defaults are disabled. Rage clicks default to 3 clicks within 1000ms and 30px. Exceptions are limited to five identical signatures per 60 seconds.

Element metadata is bounded. Password/input values, `data-ph-mask`, `.ph-mask`, and sensitive text are masked. Heatmap points contain the normalized URL, point type, viewport/document coordinates and dimensions, scroll state, fixed/sticky state, fingerprint, offsets, and timestamp. The SDK only captures and sends points; it never reads dashboard aggregates.

Heatmap preview pages use `ferno_preview=1` with a nonce, project, and dashboard origin. The iframe handshake validates source window, exact origin, nonce, project, and normalized URL before points are displayed. Preview targets must allow the dashboard origin through CSP `frame-ancestors`; cross-origin pages cannot be inspected by dashboard JavaScript, so the SDK renders the overlay in the target page.
