import { jest } from '@jest/globals'
import { Payload } from 'payload'

import { sweegoAdapter } from '.'

describe('payload-email-sweego', () => {
  const domain = process.env.SWEEGO_DOMAIN || 'zapal.tech'
  const defaultFromAddress = `hello+default@${domain}`
  const defaultFromName = 'Zapal'

  const apiKey = process.env.SWEEGO_API_KEY || 'test-api-key'

  const expectedFromName = defaultFromName
  const expectedFromEmail = `hello+from@${domain}`

  const expectedToName = defaultFromName
  const expectedToEmail = `hello+to@${domain}`

  const from = `"${expectedFromName}" <${expectedFromEmail}>`
  const to = `"${expectedToName}" <${expectedToEmail}>`
  const subject = 'This was sent on init'
  const text = 'This is my message body'
  const html = '<p>This is my message body</p>'

  const mockPayload = {} as unknown as Payload

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should handle sending an email', async () => {
    // @ts-expect-error mocking global fetch
    global.fetch = jest.spyOn(global, 'fetch')

    const adapter = sweegoAdapter({
      apiKey,
      defaultFromAddress,
      defaultFromName,
      dryRun: true,
    })

    await adapter({ payload: mockPayload }).sendEmail({
      from,
      to,
      subject,
      text,
      html,
    })

    // @ts-expect-error mocking global fetch
    expect(global.fetch.mock.calls[0][0]).toStrictEqual('https://api.sweego.io/send')

    // @ts-expect-error mocking global fetch
    const request = global.fetch.mock.calls[0][1]

    expect(request.headers['Api-Key']).toStrictEqual(apiKey)
    expect(JSON.parse(request.body)).toMatchObject({
      from: {
        email: expectedFromEmail,
        name: expectedFromName,
      },
      'dry-run': true,
      subject,
      'message-txt': text,
      'message-html': html,
      recipients: [
        {
          email: expectedToEmail,
          name: expectedToName,
        },
      ],
    })
  })

  // Error response does not described in the docs
  it('should throw an error if the email fails to send', async () => {
    const errorResponse = {
      detail: [
        {
          message: 'error message',
          field: 'field',
        },
      ],
    }
    // @ts-expect-error mocking global fetch
    global.fetch = jest.spyOn(global, 'fetch')

    const adapter = sweegoAdapter({
      apiKey,
      defaultFromAddress,
      defaultFromName,
    })

    await expect(() =>
      adapter({ payload: mockPayload }).sendEmail({
        from,
        subject,
        text,
      }),
    ).rejects.toThrow(new RegExp('^Error sending email: \\d{3}'))
  })
})
