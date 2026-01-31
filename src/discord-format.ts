import { EmbedBuilder } from 'discord.js'
import type { APIEmbed } from 'discord.js'
import type { AttendanceReward, AttendanceStatus, RunResult } from './types.js'
import type { RunReason } from './scheduler.js'

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

function formatTodayStatus(status?: AttendanceStatus): string {
  if (!status) return 'Unknown'
  if (status.hasToday === true) return 'Done'
  if (status.hasToday === false) return 'Not done'
  return 'Unknown'
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
    .setTitle('Endfield Attendence')
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
    .setTitle('Endfield Attendence')
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
