# @fernohq/analytics-node

Ferno’s Node SDK sends server-side identify, track, page, and group events to
your Ferno project. It supports Node.js and other runtimes with compatible
fetch and crypto APIs.

For additional API background, see [Segment’s compatible Node source
documentation](https://segment.com/docs/connections/sources/catalog/libraries/server/node).


## Runtime Support
- Node.js >= 20
- AWS Lambda
- Cloudflare Workers
- Vercel Edge Functions
- Web Workers / Browser (runtime support varies by available APIs)

## Quick Start

### Ferno

Ferno authenticates project API keys as Bearer tokens and ingests SDK batches
at `POST /events`. Configure the Node SDK as follows:

```ts
import { Analytics } from '@fernohq/analytics-node'

const analytics = new Analytics({
  writeKey: process.env.FERNO_API_KEY!,
  host: process.env.FERNO_API_URL ?? 'https://data.useferno.com',
  path: '/events',
  authMode: 'bearer',
})

analytics.track({ userId: 'user-123', event: 'signup' })
await analytics.closeAndFlush()
```

For local development, set `FERNO_API_URL=http://localhost:8080`. Ferno API
keys use the `ferno_pk_` prefix; keep them in environment variables.

### Install
```bash
# npm
npm install @fernohq/analytics-node
# yarn
yarn add @fernohq/analytics-node
# pnpm
pnpm install @fernohq/analytics-node
```

### Usage
Assuming some express-like web framework.
```ts
import { Analytics } from '@fernohq/analytics-node'
// or, if you use require:
const { Analytics } = require('@fernohq/analytics-node')

// instantiation
const analytics = new Analytics({ writeKey: '<MY_WRITE_KEY>' })

app.post('/login', (req, res) => {
   analytics.identify({
      userId: req.body.userId,
      previousId: req.body.previousId
  })
  res.sendStatus(200)
})

app.post('/cart', (req, res) => {
  analytics.track({
    userId: req.body.userId,
    event: 'Add to cart',
    properties: { productId: '123456' }
  })
   res.sendStatus(201)
});
```
For more examples, see the [Ferno SDK repository](https://github.com/fernohq/sdk).
The SDK keeps a Segment-compatible event API; Segment’s [Node configuration
reference](https://segment.com/docs/connections/sources/catalog/libraries/server/node/#configuration)
is available for compatibility details.


## Settings & configuration

Ferno-specific settings include the project API key, API host, event path, and
Bearer authentication mode. See the [AnalyticsSettings interface](src/app/settings.ts)
for the complete list.

For legacy Segment configuration names and migration behavior, see [Segment’s
Node migration guide](https://segment.com/docs/connections/sources/catalog/libraries/server/node/migration).
