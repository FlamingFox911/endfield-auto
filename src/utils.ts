export function getShanghaiDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function getShanghaiDateFromUnixSeconds(seconds: string): string {
  const millis = Number(seconds) * 1000
  return getShanghaiDate(new Date(millis))
}
