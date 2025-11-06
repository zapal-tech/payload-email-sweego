import type Mail from 'nodemailer/lib/mailer'
import { APIError, type EmailAdapter, type SendEmailOptions } from 'payload'

import 'dotenv/config'

export type SweegoAdapterArgs = {
  apiKey: string
  defaultFromAddress: string
  defaultFromName: string
  dryRun?: boolean
}

type SweegoAdapter = EmailAdapter<SweegoResponse>

type SweegoSuccess = {
  channel: string
  provider: string
  swg_uids: Record<string, string>
  transaction_id: string
}

type SweegoError = {
  detail: {
    msg: string
    type: string | null
  }[]
}

type SweegoResponse = SweegoSuccess | SweegoError

/**
 * Email adapter for [Sweego](https://www.sweego.io) REST API
 */
export const sweegoAdapter = ({ apiKey, defaultFromAddress, defaultFromName, dryRun }: SweegoAdapterArgs): SweegoAdapter => {
  const adapter: SweegoAdapter = () => ({
    name: 'sweego-rest',
    defaultFromAddress,
    defaultFromName,
    sendEmail: async (message) => {
      // Map the Payload email options to Sweego email options
      const sendEmailOptions = mapPayloadEmailToSweegoEmail(message, defaultFromAddress, defaultFromName, dryRun)

      const res = await fetch('https://api.sweego.io/send', {
        body: JSON.stringify(sendEmailOptions),
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })

      if (res.status === 200) return (await res.json()) as SweegoSuccess
      else {
        const data = (await res.json()) as SweegoError

        console.log(data)
        let formattedError = `Error sending email: ${res.status} ${res.statusText}.`

        ;(data.detail || []).forEach(({ msg, type }, idx) => {
          if (type && msg)
            formattedError += `${idx !== 0 ? '; ' : ' '}${type && type !== 'null' ? `Type: "${type}", ` : ''}Message: "${msg}"`
        })

        throw new APIError(formattedError, res.status)
      }
    },
  })

  return adapter
}

function mapPayloadEmailToSweegoEmail(
  message: SendEmailOptions,
  defaultFromAddress: string,
  defaultFromName: string,
  dryRun = false,
): SweegoSendEmailOptions {
  // const cc = mapAddresses(message.cc)
  // const bcc = mapAddresses(message.bcc)
  const attachments = mapAttachments(message.attachments)

  const email: SweegoSendEmailOptions = {
    // Required
    provider: 'sweego',
    channel: 'email',
    recipients: mapAddresses(message.to),
    from: mapFromAddress(message.from, defaultFromName, defaultFromAddress),
    subject: message.subject ?? '',

    // Optional
    attachments: attachments?.length ? attachments : undefined,
  }

  if (dryRun) email['dry-run'] = true

  if (message.headers) email.headers = messageHeadersToSweegoHeaders(message.headers)

  if (message.text) email['message-txt'] = message.text.toString?.() || ''
  if (message.html) email['message-html'] = message.html.toString?.() || ''

  if (message.replyTo) {
    if (message.replyTo === 'string') {
      email.reply_to = {
        email: extractEmailFromAddressString(message.replyTo),
        name:
          extractNameFromAddressString(message.replyTo) === message.replyTo
            ? undefined
            : extractNameFromAddressString(message.replyTo),
      }
    } else if (Array.isArray(message.replyTo)) {
      const addresses = mapAddresses(message.replyTo)

      if (addresses.length) email.reply_to = addresses[0]
    } else {
      email.reply_to = {
        email: extractEmailFromAddressString((message.replyTo as Mail.Address).address),
        name:
          (message.replyTo as Mail.Address).name === (message.replyTo as Mail.Address).address
            ? undefined
            : (message.replyTo as Mail.Address).name,
      }
    }
  }

  return email
}

const extractEmailFromAddressString = (address: string) =>
  address
    .trim()
    .replace(/.*<(.*)>/, '$1')
    .trim()

const extractNameFromAddressString = (address: string) =>
  address
    .trim()
    .replace(/(.*)<.*>/, '$1')
    .trim()
    .replaceAll(/^"|"$/g, '')
    .trim()
    .replaceAll(/^'|'$/g, '')
    .trim()

function mapFromAddress(
  address: SendEmailOptions['from'],
  defaultFromName: string,
  defaultFromAddress: string,
): SweegoSendEmailOptions['from'] {
  if (!address)
    return {
      email: defaultFromAddress,
      name: defaultFromName,
    }

  if (typeof address === 'string')
    return {
      email: extractEmailFromAddressString(address),
      name: extractNameFromAddressString(address) === address ? undefined : extractNameFromAddressString(address),
    }

  return {
    email: extractEmailFromAddressString(address.address),
    name: address.name === address.address ? undefined : address.name,
  }
}

function mapAddresses(addresses: SendEmailOptions['to']): SweegoSendEmailOptions['recipients'] {
  if (!addresses) return []

  if (typeof addresses === 'string')
    return [
      {
        email: extractEmailFromAddressString(addresses),
        name: extractNameFromAddressString(addresses) === addresses ? undefined : extractNameFromAddressString(addresses),
      },
    ]

  if (Array.isArray(addresses))
    return addresses.map((address) => ({
      email:
        typeof address === 'string' ? extractEmailFromAddressString(address) : extractEmailFromAddressString(address.address),
      name:
        typeof address === 'string'
          ? extractNameFromAddressString(address) === address
            ? undefined
            : extractNameFromAddressString(address)
          : address.name === address.address
            ? undefined
            : address.name,
    }))

  return [
    {
      email: extractEmailFromAddressString(addresses.address),
      name: addresses.name === addresses.address ? undefined : addresses.name,
    },
  ]
}

function mapAttachments(attachments: SendEmailOptions['attachments']): SweegoSendEmailOptions['attachments'] {
  if (!attachments) return undefined

  return attachments.map((attachment) => {
    if (!attachment.filename || !attachment.content) throw new APIError('Attachment is missing filename or content', 400)

    if (typeof attachment.content === 'string')
      return {
        content: Buffer.from(attachment.content),
        filename: attachment.filename,
      }

    if (attachment.content instanceof Buffer)
      return {
        content: attachment.content,
        filename: attachment.filename,
      }

    throw new APIError('Attachment content must be a string or a buffer', 400)
  })
}

function messageHeadersToSweegoHeaders(headers: Mail.Headers): Record<string, string> {
  const sweegoHeaders: Record<string, string> = {}

  if (typeof headers === 'object' && headers) {
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value === 'string') {
        sweegoHeaders[key] = value
      } else if (Array.isArray(value)) {
        sweegoHeaders[key] = value.join(', ')
      }
    }
  }

  return sweegoHeaders
}

export type SweegoSendEmailOptions = {
  /**
   * If true, the email will be sent in test mode and will not be delivered to the recipient.
   *
   * @default false
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'dry-run'?: boolean
  /**
   * Email provider to use for this email send.
   *
   * @default "sweego"
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  provider: string
  /**
   * Channel to use for this email send.
   *
   * @default "email"
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  channel: string
  /**
   * Sender email address object. `email` property is required; to include a friendly name, use the `name` property.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  from: EmailAddress
  /**
   * Recipient email addresses array. Each object must have an `email` property; to include a friendly name, use the `name` property.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  recipients: EmailAddress[]
  /**
   * Reply-to email address.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  reply_to?: EmailAddress
  /**
   * Email subject (global level).
   *
   * See line length limits specified in [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822#section-2.1.1) for guidance on subject line character limits.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  subject: string
  /**
   * The plain text of the message with the appropriate mime type.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'message-txt'?: string
  /**
   * The html version of the message with the appropriate mime type.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'message-html'?: string
  /**
   * Filename and content of attachments (max 30mb per email as the system limit, recommended size is up to 10mb).
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   * @link [Attachments](https://learn.sweego.io/docs/emails/attachments)
   */
  attachments?: Attachment[]
  /**
   * Custom headers to add to the email. Limited to 5 headers.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   * @link [Custom Headers](https://learn.sweego.io/docs/headers/custom_headers)
   */
  headers?: Record<string, string>
  /**
   * ID of a pre-defined template to use for this email.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   * @link [Templates](https://learn.sweego.io/docs/templates/create)
   */
  'template-id'?: string
  /**
   * An object or array of objects containing key-value pairs for template variables.
   *
   * If an object is provided, the variables will be applied globally to all recipients.
   * If an array of objects is provided, each object corresponds to a recipient in the `recipients` field in the same order.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   * @link [Template Variables](https://learn.sweego.io/docs/templates/variables)
   */
  variables?: Variable | Variable[]
  /**
   * Campaign ID for tracking purposes.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'campaign-id'?: string
  /**
   * Campaign type for tracking purposes
   *
   * @default "transac"
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'campaign-type'?: 'transac' | 'newsletter' | 'market'
  /**
   * Tags to associate with the email for tracking purposes. Limited to 5 tags.
   * Only tags within `^[A-Za-z0-9-]{1,20}$` regex allowed.
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   */
  'campaign-tags'?: string[]
  /**
   * Set list-unsubscribe header, with one-click management. Default method value: `mailto`.
   *
   * Example values:
   * ```
   * { "value": "<mailto:...>" }
   * { "method": "mailto", "value": "<mailto:...>" }
   * { "method": "one-click", "value": "<mailto:...>,<https://...>" }
   * ```
   *
   * @link [Body Parameters](https://learn.sweego.io/docs/sending/how_to_send_email_by_api#body-parameters)
   * @link [List-Unsubscribe](https://learn.sweego.io/docs/headers/list_unsub)
   */
  'list-unsub'?: ListUnsubscribe
  /**
   * Expiration time for the email, in [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822#section-3.6.7) format.
   *
   * @link [Expiration Date Header](https://learn.sweego.io/docs/headers/expiration_date#api)
   */
  expires?: string
}

type ListUnsubscribe = {
  method?: 'mailto' | 'one-click'
  value: string
}

type EmailAddress = {
  email: string
  name?: string
}

type Attachment = {
  // Content of an attached file.
  content: Buffer | string
  // Name of attached file.
  filename: string
}

type Variable = Record<string, string | number | boolean | null>
