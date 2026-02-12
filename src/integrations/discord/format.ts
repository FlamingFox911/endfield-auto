import { EmbedBuilder } from 'discord.js'
import type { APIEmbed } from 'discord.js'
import type { AttendanceReward, AttendanceStatus, RunResult } from '../../types/index.js'
import type { RunReason } from '../../core/attendance/types.js'
import type { CodeWatchRunReason, CodeWatchRunSummary, TrackedCode } from '../../core/codes/types.js'

const COLOR_SUCCESS = 0xf59f00
const COLOR_WARN = 0xf08c00
const COLOR_ERROR = 0xe03131
const COLOR_INFO = 0x4c6ef5
const EMBED_AUTHOR_NAME = 'Perlica'
const EMBED_AUTHOR_ICON_URL = 'https://play-lh.googleusercontent.com/l6FVNa293RykBWy88TqEhUakIcGSC8bRygSnKOBgztln48JX-WzMWnrBAETrKZsxDNC4HhwCsvfle_UI7rBE=s256-rw'

function buildAuthor(): { name: string; iconURL: string } {
  return { name: EMBED_AUTHOR_NAME, iconURL: EMBED_AUTHOR_ICON_URL }
}

export function getWebhookIdentity(): { username: string; avatarUrl: string } {
  return { username: EMBED_AUTHOR_NAME, avatarUrl: EMBED_AUTHOR_ICON_URL }
}

function formatReason(reason: RunReason): string {
  switch (reason) {
    case 'startup':
      return 'Startup catch-up'
    case 'manual':
      return 'Manual'
    case 'scheduled':
      return 'Scheduled'
    default:
      return 'Run'
  }
}

function formatCodeWatchReason(reason: CodeWatchRunReason): string {
  switch (reason) {
    case 'startup':
      return 'Startup scan'
    case 'scheduled':
      return 'Scheduled scan'
    case 'manual':
      return 'Manual scan'
    default:
      return 'Scan'
  }
}

function asDiscordTime(value: string | undefined): string {
  if (!value) return 'Unknown'
  const timestamp = Math.floor(new Date(value).getTime() / 1000)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown'
  return `<t:${timestamp}:f>`
}

function codeConfidence(code: TrackedCode): string {
  const tiers = new Set(code.sources.map(source => source.sourceTier))
  if (tiers.has('official')) return 'Official source'
  if (tiers.has('curated')) return 'Curated source'
  if (code.sources.length >= 2) return 'Cross-source confirmation'
  return 'Community-only (unverified)'
}

function formatSourceName(value: string): string {
  return value
    .replace(/\s+Endfield\s+Codes$/i, '')
    .trim()
}

function formatCodeSources(code: TrackedCode): string {
  const unique = Array.from(new Set(code.sources.map(source => formatSourceName(source.sourceName))))
  if (unique.length === 0) return 'Unknown'
  return unique.join(', ')
}

export function formatRewardsList(rewards: AttendanceReward[] | undefined): string {
  if (!rewards || rewards.length === 0) return 'None'
  return rewards
    .map((reward) => {
      const count = typeof reward.count === 'number' ? ` x${reward.count}` : ''
      return `- ${reward.name}${count}`.trim()
    })
    .join('\n')
}

function pickRewardIcon(rewards: AttendanceReward[] | undefined): string | undefined {
  return rewards?.find(reward => Boolean(reward.icon))?.icon
}

function formatProgress(status?: AttendanceStatus): string {
  if (!status) return 'Unknown'
  if (typeof status.doneCount === 'number' && typeof status.totalCount === 'number') {
    return `${status.doneCount}/${status.totalCount}`
  }
  return 'Unknown'
}

function formatMissing(status?: AttendanceStatus): string {
  if (!status) return 'Unknown'
  if (typeof status.missingCount === 'number') return String(status.missingCount)
  return 'Unknown'
}

export function buildRunEmbed(result: RunResult, reason: RunReason, index: number, total: number, timestamp = new Date()): APIEmbed {
  const profileLabel = result.profileLabel ?? 'Profile'
  const status = result.status
  const color = result.ok ? COLOR_SUCCESS : result.already ? COLOR_WARN : COLOR_ERROR

  const rewardList = result.rewards && result.rewards.length > 0
    ? formatRewardsList(result.rewards)
    : (status?.todayRewards ? formatRewardsList(status.todayRewards) : 'None')

  const resultText = result.ok
    ? 'Attendance logged, Endmin. Endfield systems are steady.'
    : result.already
      ? 'Attendance already on record, Endmin. Endfield systems are steady.'
      : 'Attendance failed, Endmin. Endfield systems report instability.'

  const footer = `Endfield Auto Check-in (${index}/${total}) - ${formatReason(reason)}`

  const embed = new EmbedBuilder()
    .setTitle('Endfield Attendance')
    .setAuthor(buildAuthor())
    .setColor(color)
    .addFields(
      { name: 'Username', value: profileLabel, inline: false },
      { name: "Today's Reward", value: rewardList, inline: true },
      { name: 'Progress', value: formatProgress(status), inline: true },
      { name: 'Missing', value: formatMissing(status), inline: true },
      { name: 'Result', value: resultText, inline: false },
    )
    .setFooter({ text: footer })
    .setTimestamp(timestamp)

  const icon = pickRewardIcon(result.rewards) ?? pickRewardIcon(status?.todayRewards)
  if (icon) {
    embed.setThumbnail(icon)
  }

  return embed.toJSON()
}

export function buildStatusEmbed(profileLabel: string, status: AttendanceStatus, timestamp = new Date()): APIEmbed {
  const color = status.ok ? COLOR_INFO : COLOR_ERROR
  const resultText = status.ok
    ? 'Status check complete, Endmin. Endfield systems are steady.'
    : 'Status check failed, Endmin. Endfield systems report instability.'

  const embed = new EmbedBuilder()
    .setTitle('Endfield Attendance')
    .setAuthor(buildAuthor())
    .setColor(color)
    .setTimestamp(timestamp)

  if (!status.ok) {
    embed.addFields(
      { name: 'Username', value: profileLabel, inline: false },
      { name: 'Result', value: resultText, inline: false },
    )
      .setFooter({ text: 'Status check failed' })
    return embed.toJSON()
  }

  const rewardList = status.hasToday === false && status.todayRewards
    ? formatRewardsList(status.todayRewards)
    : 'Already claimed'

  embed
    .addFields(
      { name: 'Username', value: profileLabel, inline: false },
      { name: "Today's Reward", value: rewardList, inline: true },
      { name: 'Progress', value: formatProgress(status), inline: true },
      { name: 'Missing', value: formatMissing(status), inline: true },
      { name: 'Result', value: resultText, inline: false },
    )
    .setFooter({ text: 'Status check' })

  const icon = pickRewardIcon(status.todayRewards)
  if (icon) {
    embed.setThumbnail(icon)
  }

  return embed.toJSON()
}

export function buildCodeDiscoveryEmbed(
  code: TrackedCode,
  reason: CodeWatchRunReason,
  index: number,
  total: number,
  timestamp = new Date(),
): APIEmbed {
  const primary = code.sources[0]
  const sourceLink = primary?.referenceUrl ?? primary?.sourceUrl
  const footer = `Endfield Code Watch (${index}/${total}) - ${formatCodeWatchReason(reason)}`

  const embed = new EmbedBuilder()
    .setTitle('Endfield Redemption Code')
    .setAuthor(buildAuthor())
    .setColor(COLOR_SUCCESS)
    .addFields(
      { name: 'Code', value: `\`${code.code}\``, inline: false },
      { name: 'Confidence', value: codeConfidence(code), inline: true },
      { name: 'First Seen', value: asDiscordTime(code.firstSeenAt), inline: true },
      { name: 'Sources', value: formatCodeSources(code), inline: false },
      { name: 'Redeem', value: 'Redeem in-game only.', inline: false },
    )
    .setFooter({ text: footer })
    .setTimestamp(timestamp)

  if (sourceLink) {
    embed.setURL(sourceLink)
  }

  return embed.toJSON()
}

function buildCodeListValue(codes: TrackedCode[]): string {
  const lines = codes.map((code) => `\`${code.code}\` - ${codeConfidence(code)}`)
  const maxLength = 1024
  if (lines.join('\n').length <= maxLength) {
    return lines.join('\n')
  }

  const selected: string[] = []
  let length = 0
  for (const line of lines) {
    const next = selected.length === 0 ? line : `\n${line}`
    if (length + next.length > maxLength - 32) break
    selected.push(line)
    length += next.length
  }
  const remaining = lines.length - selected.length
  if (remaining > 0) {
    selected.push(`+${remaining} more`)
  }
  return selected.join('\n')
}

export function buildCodeDiscoveryBatchEmbed(
  codes: TrackedCode[],
  reason: CodeWatchRunReason,
  timestamp = new Date(),
): APIEmbed {
  const uniqueSources = Array.from(
    new Set(
      codes.flatMap(code => code.sources.map(source => formatSourceName(source.sourceName))),
    ),
  )
  const checkedAt = asDiscordTime(timestamp.toISOString())
  const embed = new EmbedBuilder()
    .setTitle('Endfield Redemption Codes')
    .setAuthor(buildAuthor())
    .setColor(COLOR_SUCCESS)
    .addFields(
      { name: 'New Codes', value: buildCodeListValue(codes), inline: false },
      { name: 'Count', value: String(codes.length), inline: true },
      { name: 'Scan', value: formatCodeWatchReason(reason), inline: true },
      { name: 'Checked At', value: checkedAt, inline: true },
      { name: 'Sources', value: uniqueSources.join(', ').slice(0, 1024) || 'Unknown', inline: false },
      { name: 'Redeem', value: 'Redeem in-game only.', inline: false },
    )
    .setFooter({ text: 'Code watch discovery' })
    .setTimestamp(timestamp)

  return embed.toJSON()
}

export function buildCodesListEmbed(
  codes: TrackedCode[],
  options?: { sourceName?: string },
  timestamp = new Date(),
): APIEmbed {
  const sourceName = options?.sourceName?.trim()
  const embed = new EmbedBuilder()
    .setTitle('Endfield Redeem Codes')
    .setAuthor(buildAuthor())
    .setColor(COLOR_INFO)
    .setTimestamp(timestamp)

  if (codes.length === 0) {
    embed
      .setDescription(
        sourceName
          ? `No redeem codes have been tracked yet for ${sourceName}.`
          : 'No redeem codes have been tracked yet.',
      )
      .setFooter({ text: 'Redemption Codes' })
    return embed.toJSON()
  }

  const lines = codes.map((code) => {
    const seen = asDiscordTime(code.firstSeenAt)
    return `\`${code.code}\` - ${codeConfidence(code)} - seen ${seen}`
  })

  embed
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Redeem', value: 'Redeem in-game only.', inline: false },
    )
    .setFooter({ text: 'Redemption Codes' })

  return embed.toJSON()
}

export function buildCodeWatchRunEmbed(summary: CodeWatchRunSummary, timestamp = new Date()): APIEmbed {
  const color = summary.notifiedCodes.length > 0 ? COLOR_SUCCESS : COLOR_INFO
  const skippedText = summary.skippedSources.length > 0
    ? summary.skippedSources.map(item => `${item.sourceId}: ${item.reason}`).join('\n').slice(0, 1024)
    : 'None'
  const checked = summary.checkedSources.length > 0
    ? summary.checkedSources.join(', ')
    : 'None'

  const embed = new EmbedBuilder()
    .setTitle('Endfield Code Watch')
    .setAuthor(buildAuthor())
    .setColor(color)
    .addFields(
      { name: 'Mode', value: summary.mode, inline: true },
      { name: 'Reason', value: formatCodeWatchReason(summary.reason), inline: true },
      { name: 'Checked Sources', value: checked, inline: false },
      { name: 'Skipped Sources', value: skippedText, inline: false },
      { name: 'New Codes', value: String(summary.newCodes.length), inline: true },
      { name: 'Notified Codes', value: String(summary.notifiedCodes.length), inline: true },
      { name: 'Total Known', value: String(summary.totalKnown), inline: true },
    )
    .setFooter({ text: 'Code watch run result' })
    .setTimestamp(timestamp)

  return embed.toJSON()
}
