import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  doublePrecision,
  unique,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const sourceTypeEnum = pgEnum('source_type', [
  'site_agenda',
  'site_actu',
  'fb_page',
  'fb_group',
  'ical',
  'rss',
  'geocity',
])

export const crawlStatusEnum = pgEnum('crawl_status', ['ok', 'error', 'empty'])

export const categorieEnum = pgEnum('categorie', [
  'culture',
  'sport',
  'politique',
  'marche',
  'autre',
])

export const recurrenceEnum = pgEnum('recurrence', [
  'aucune',
  'quotidienne',
  'hebdo',
  'mensuelle',
  'annuelle',
  'custom',
])

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  commune: text('commune').notNull(),
  codeOfs: integer('code_ofs'),
  type: sourceTypeEnum('type').notNull(),
  url: text('url').notNull().unique(),
  active: boolean('active').notNull().default(true),
  // centre commune pré-géocodé une fois (fallback si event sans adresse précise)
  communeLat: doublePrecision('commune_lat'),
  communeLng: doublePrecision('commune_lng'),
  // stratégie d'extraction issue de l'audit J0
  extractionStrategy: text('extraction_strategy'),
  lastCrawlAt: timestamp('last_crawl_at', { withTimezone: true }),
  lastCrawlStatus: crawlStatusEnum('last_crawl_status'),
  lastCrawlError: text('last_crawl_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'set null' }),
    sourceUrl: text('source_url'),
    nom: text('nom').notNull(),
    descriptionCourte: text('description_courte'),
    descriptionLongue: text('description_longue'),
    photoUrl: text('photo_url'),
    dateDebut: date('date_debut').notNull(),
    heureDebut: time('heure_debut'),
    dateFin: date('date_fin'),
    heureFin: time('heure_fin'),
    lieuNom: text('lieu_nom'),
    adresse: text('adresse'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    categorie: categorieEnum('categorie').notNull().default('autre'),
    recurrence: recurrenceEnum('recurrence').notNull().default('aucune'),
    prix: text('prix'),
    popularite: integer('popularite').notNull().default(0),
    scoreQualite: integer('score_qualite').notNull().default(0),
    hidden: boolean('hidden').notNull().default(false),
    edited: boolean('edited').notNull().default(false),
    crawledAt: timestamp('crawled_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // dédup intra-source : un évent ne peut exister qu'une fois par source/date/nom
    uniqIntraSource: unique('uniq_event_intra_source').on(t.sourceId, t.dateDebut, t.nom),
    idxDateNotHidden: index('idx_events_date_visible')
      .on(t.dateDebut)
      .where(sql`hidden = false`),
    idxSource: index('idx_events_source').on(t.sourceId),
  })
)

export const geocodeCache = pgTable('geocode_cache', {
  adresseNormalized: text('adresse_normalized').primaryKey(),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Source = typeof sources.$inferSelect
export type NewSource = typeof sources.$inferInsert
export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
