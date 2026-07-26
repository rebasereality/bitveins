import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.BITVEINS_DATABASE_PATH || `${process.env.HOME}/.local/share/bitveins/history.sqlite`,
  },
})
