import { EmbedBuilder } from 'discord.js'
import type { APIEmbed } from 'discord.js'
import type { AttendanceReward, AttendanceStatus, RunResult } from './types.js'
import type { RunReason } from './scheduler.js'

const COLOR_SUCCESS = 0xf59f00
const COLOR_WARN = 0xf08c00
const COLOR_ERROR = 0xe03131
const COLOR_INFO = 0x4c6ef5

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
  const profileLabel = result.profileLabel ?? result.profileId
  const status = result.status
  const color = result.ok ? COLOR_SUCCESS : result.already ? COLOR_WARN : COLOR_ERROR

  const rewardList = result.rewards && result.rewards.length > 0
    ? formatRewardsList(result.rewards)
    : (status?.todayRewards ? formatRewardsList(status.todayRewards) : 'None')

  const resultLine = result.ok
    ? 'Success'
    : result.already
      ? 'Already checked in'
      : 'Failed'

  const footer = `Endfield Auto Check-in (${index}/${total}) - ${formatReason(reason)}`

  const embed = new EmbedBuilder()
    .setTitle('Endfield Attendance')
    .setAuthor({ name: profileLabel })
    .setColor(color)
    .addFields(
      { name: 'Today', value: formatTodayStatus(status), inline: true },
      { name: 'Progress', value: formatProgress(status), inline: true },
      { name: 'Missing', value: formatMissing(status), inline: true },
      { name: "Today's Reward", value: rewardList, inline: false },
      { name: 'Result', value: `${resultLine}: ${result.message}`, inline: false },
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

  const embed = new EmbedBuilder()
    .setTitle('Endfield Attendance Status')
    .setAuthor({ name: profileLabel })
    .setColor(color)
    .setTimestamp(timestamp)

  if (!status.ok) {
    embed.setDescription(status.message)
      .setFooter({ text: 'Status check failed' })
    return embed.toJSON()
  }

  const rewardList = status.hasToday === false && status.todayRewards
    ? formatRewardsList(status.todayRewards)
    : 'Already claimed'

  embed
    .addFields(
      { name: 'Today', value: formatTodayStatus(status), inline: true },
      { name: 'Progress', value: formatProgress(status), inline: true },
      { name: 'Missing', value: formatMissing(status), inline: true },
      { name: "Today's Reward", value: rewardList, inline: false },
    )
    .setFooter({ text: 'Status check' })

  const icon = pickRewardIcon(status.todayRewards)
  if (icon) {
    embed.setThumbnail(icon)
  }

  return embed.toJSON()
}
