import { REST, Routes } from 'discord.js'

const COMMANDS = [
  {
    name: 'checkin',
    description: 'Run Endfield attendance now',
  },
  {
    name: 'status',
    description: 'Show last attendance status',
  },
]

export async function registerCommands(token: string, appId: string, guildId: string): Promise<void> {
  const rest = new REST({ version: '10' }).setToken(token)
  await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: COMMANDS })
}
