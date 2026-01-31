export type NotificationPayload = string | {
  content?: string
  embeds?: unknown[]
}

export interface Notifier {
  send(payload: NotificationPayload): Promise<void>
}
