/**
 * Seed des sources commune + Facebook + Yverdon geocity.
 *
 * Applique les flags `active` et `extraction_strategy` selon l'audit J0
 * (cf. sources-audit.md).
 *
 * Pré-géocode chaque centre commune via Nominatim (rate limit 1 req/s).
 *
 * Usage : npm run db:seed
 */
import 'dotenv/config'
import { db, sources, type NewSource } from '../lib/db'

type SeedSource = Omit<NewSource, 'id' | 'createdAt' | 'communeLat' | 'communeLng'> & {
  /** ville/lieu à géocoder pour le centre commune (peut différer de `commune`) */
  geocodeQuery?: string
}

const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ?? 'agenda-nv-poc/1.0 (dev)'

const SOURCES_SEED: SeedSource[] = [
  // ⭐ ical_jsonld (parsing direct, coût ~0)
  {
    commune: 'Champagne',
    codeOfs: 5553,
    type: 'site_agenda',
    url: 'https://champagne.ch/evenements/',
    active: true,
    extractionStrategy: 'json_ld',
  },
  {
    commune: 'Mathod',
    codeOfs: 5919,
    type: 'site_agenda',
    url: 'https://www.mathod.ch/?post_type=tribe_events&ical=1&eventDisplay=list',
    active: true,
    extractionStrategy: 'ical',
  },
  {
    commune: 'Fontaines-sur-Grandson',
    codeOfs: 5557,
    type: 'site_agenda',
    url: 'https://www.fontaines-sur-grandson.ch/index.php/calendrier/list.events/-',
    active: true,
    extractionStrategy: 'jevents_ical',
  },

  // 🌐 special : Yverdon via API geocity (déjà câblée dans le projet existant)
  {
    commune: 'Yverdon-les-Bains',
    codeOfs: 5938,
    type: 'geocity',
    url: 'geocity://yverdon',
    active: true,
    extractionStrategy: 'geocity_api',
  },

  // 📝 html_libre (Firecrawl + LLM)
  {
    commune: 'Bioley-Magnoux',
    codeOfs: 5903,
    type: 'site_actu',
    url: 'https://bioley-magnoux.ch/officiel/pilier-public/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Bonvillars',
    codeOfs: 5551,
    type: 'site_actu',
    url: 'https://bonvillars.ch/pilier-public/actualites/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Chamblon',
    codeOfs: 5904,
    type: 'site_agenda',
    url: 'https://chamblon.ch/manifestations-annuelles/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Champvent',
    codeOfs: 5905,
    type: 'site_agenda',
    url: 'https://champvent.ch/manifestations',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Cronay',
    codeOfs: 5910,
    type: 'site_actu',
    url: 'https://www.cronay.ch/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Donneloye',
    codeOfs: 5913,
    type: 'site_actu',
    url: 'https://www.donneloye.ch/actualite/pilier-public',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Ependes',
    codeOfs: 5914,
    type: 'site_agenda',
    // URL changée par rapport à la liste initiale (audit J0 : la page event/ a peut-être plus de contenu)
    url: 'https://ependesvd.ch/event',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Fiez',
    codeOfs: 5556,
    type: 'site_actu',
    url: 'https://www.fiez.ch/index.php/pilier-public',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Montagny-près-Yverdon',
    codeOfs: 5922,
    type: 'site_agenda',
    url: 'https://www.montagny.ch/manifestations.php',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Suchy',
    codeOfs: 5929,
    type: 'site_agenda',
    url: 'https://suchy.ch/events/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Treycovagnes',
    codeOfs: 5931,
    type: 'site_agenda',
    url: 'https://www.treycovagnes.ch/Communication-et-agenda',
    active: true,
    extractionStrategy: 'firecrawl_llm_js', // Zabuto Calendar AJAX
  },
  {
    commune: 'Ursins',
    codeOfs: 5932,
    type: 'site_agenda',
    url: 'https://www.ursins.ch/calendrier/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Valeyres-sous-Montagny',
    codeOfs: 5933,
    type: 'site_actu',
    url: 'https://valeyres-sous-montagny.ch/infos-communales-pilier-public/actualites-communales',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },
  {
    commune: 'Yvonand',
    codeOfs: 5939,
    type: 'site_actu',
    url: 'https://yvonand.ch/yvonand-au-quotidien/pilier-public/',
    active: true,
    extractionStrategy: 'firecrawl_llm',
  },

  // 🎨 wix_dynamic (Firecrawl JS render uniquement Vuiteboeuf)
  {
    commune: 'Vuiteboeuf',
    codeOfs: 5766,
    type: 'site_agenda',
    url: 'https://www.vuiteboeuf.ch/agenda',
    active: true,
    extractionStrategy: 'firecrawl_llm_js',
  },

  // 📘 Pages Facebook publiques (POC : 3)
  {
    commune: 'Yverdon-les-Bains',
    codeOfs: 5938,
    type: 'fb_page',
    url: 'https://www.facebook.com/villeyverdonlesbains/',
    active: true,
    extractionStrategy: 'apify_fb_events',
  },
  {
    commune: 'Yvonand',
    codeOfs: 5939,
    type: 'fb_page',
    url: 'https://www.facebook.com/CommuneYvonand/',
    active: true,
    extractionStrategy: 'apify_fb_events',
  },
  {
    commune: 'Donneloye',
    codeOfs: 5913,
    type: 'fb_page',
    url: 'https://www.facebook.com/villajoye.ch',
    active: true,
    extractionStrategy: 'apify_fb_events',
  },

  // ⏸️ Désactivés au POC (audit J0 : vide ou hors scope)
  {
    commune: 'Orges',
    codeOfs: 5924,
    type: 'site_agenda',
    url: 'https://www.orges.ch/manifestations',
    active: false,
    extractionStrategy: 'wix_low_roi',
  },
  {
    commune: 'Belmont-sur-Yverdon',
    codeOfs: 5902,
    type: 'site_actu',
    url: 'https://www.belmont-sur-yverdon.ch/actualités',
    active: false,
    extractionStrategy: 'wix_low_roi',
  },
  {
    commune: 'Cheseaux-Noréaz',
    codeOfs: 5909,
    type: 'site_actu',
    url: 'https://cheseaux-noreaz.ch/accueil',
    active: false,
    extractionStrategy: 'empty',
  },
  {
    commune: 'Cuarny',
    codeOfs: 5911,
    type: 'site_agenda',
    url: 'https://www.cuarny.ch/vie-pratique/agenda',
    active: false,
    extractionStrategy: 'empty_recheck_monthly',
  },
  {
    commune: 'Giez',
    codeOfs: 5559,
    type: 'site_agenda',
    url: 'https://www.giez.fr/agenda',
    active: false,
    extractionStrategy: 'out_of_scope_france',
  },
  {
    commune: 'Grandevent',
    codeOfs: 5560,
    type: 'site_agenda',
    url: 'https://www.grandevent.ch/cms/',
    active: false,
    extractionStrategy: 'empty',
  },
  {
    commune: 'Orzens',
    codeOfs: 5925,
    type: 'site_agenda',
    url: 'https://orzens.ch/vie-locale/',
    active: false,
    extractionStrategy: 'empty',
  },
  {
    commune: 'Pomy',
    codeOfs: 5926,
    type: 'site_agenda',
    url: 'https://pomy.ch/pominfo',
    active: false,
    extractionStrategy: 'empty_recheck',
  },
  {
    commune: 'Suscévaz',
    codeOfs: 5930,
    type: 'site_agenda',
    url: 'https://www.suscevaz.ch/',
    active: false,
    extractionStrategy: 'empty_merging_2027',
  },
  {
    commune: 'Villars-Epeney',
    codeOfs: 5935,
    type: 'site_agenda',
    url: 'https://www.villars-epeney.ch/index.php/autorites/administration/calendrier-communal',
    active: false,
    extractionStrategy: 'empty',
  },
  {
    commune: 'Vugelles-La Mothe',
    codeOfs: 5937,
    type: 'site_agenda',
    url: 'https://vugelleslamothe.ch/agenda/',
    active: false,
    extractionStrategy: 'wp_events_calendar_no_data',
  },
]

async function geocodeCommune(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', `${query}, Vaud, Switzerland`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
    })
    if (!res.ok) {
      console.warn(`  ⚠ Nominatim ${res.status} pour "${query}"`)
      return null
    }
    const data = (await res.json()) as Array<{ lat: string; lon: string }>
    if (data.length === 0) {
      console.warn(`  ⚠ Aucun résultat Nominatim pour "${query}"`)
      return null
    }
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) }
  } catch (err) {
    console.warn(`  ⚠ Erreur Nominatim pour "${query}":`, err)
    return null
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  console.log(`Seed de ${SOURCES_SEED.length} sources...`)

  // Géocode unique par commune (mutualise les hits Nominatim)
  const uniqueCommunes = [...new Set(SOURCES_SEED.map((s) => s.geocodeQuery ?? s.commune))]
  console.log(`Géocodage de ${uniqueCommunes.length} communes uniques (Nominatim, 1 req/s)...`)

  const geocoded = new Map<string, { lat: number; lng: number }>()
  for (const commune of uniqueCommunes) {
    const result = await geocodeCommune(commune)
    if (result) {
      geocoded.set(commune, result)
      console.log(`  ✓ ${commune} → ${result.lat.toFixed(4)}, ${result.lng.toFixed(4)}`)
    }
    await sleep(1100) // politesse Nominatim : > 1 req/s
  }

  console.log(`\nInsertion en DB...`)
  const rows: NewSource[] = SOURCES_SEED.map((s) => {
    const geo = geocoded.get(s.geocodeQuery ?? s.commune)
    return {
      commune: s.commune,
      codeOfs: s.codeOfs,
      type: s.type,
      url: s.url,
      active: s.active ?? true,
      extractionStrategy: s.extractionStrategy,
      communeLat: geo?.lat,
      communeLng: geo?.lng,
    }
  })

  const inserted = await db
    .insert(sources)
    .values(rows)
    .onConflictDoNothing({ target: sources.url })
    .returning({ id: sources.id, commune: sources.commune, url: sources.url })

  console.log(`\n✓ ${inserted.length} sources insérées (les conflits sur URL ont été ignorés).`)
  console.log(
    `  Actives au POC : ${SOURCES_SEED.filter((s) => s.active !== false).length} / ${SOURCES_SEED.length}`
  )

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
