import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.POSTGRES_URL

if (!connectionString) {
  throw new Error('POSTGRES_URL is not set')
}

// Vercel Postgres recommande max 1 connexion en serverless
const client = postgres(connectionString, {
  prepare: false,
  max: 1,
})

export const db = drizzle(client, { schema })

export * from './schema'
