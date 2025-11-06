# Sweego REST Email Adapter for Payload CMS

This adapter allows you to send emails using the [Sweego](https://www.sweego.io) REST API.

## Installation

```sh
pnpm add @zapal/payload-email-sweego
```

## Usage

- Sign up for a [Sweego](https://www.sweego.io) account
- Create an API key
- Set API key as SWEEGO_API_KEY environment variable
- Configure your Payload config

```ts
// payload.config.js
import { sweegoAdapter } from '@zapal/payload-email-sweego'

export default buildConfig({
  email: sweegoAdapter({
    defaultFromAddress: 'hello@zapal.tech',
    defaultFromName: 'Zapal',
    apiKey: process.env.SWEEGO_API_KEY || '',
  }),
})
```
