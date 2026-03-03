import { groq } from '@ai-sdk/groq'
import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// AI provider configuration
const AI_PROVIDERS = {
  anthropic: {
    model: anthropic('claude-sonnet-4-5-20250929'),
    enabled: !!process.env.ANTHROPIC_API_KEY,
  },
  openai: {
    model: openai('gpt-4o'),
    enabled: !!process.env.OPENAI_API_KEY,
  },
  groq: {
    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),
    enabled: !!process.env.GROQ_API_KEY,
  },
}

// Get the active AI provider
function getAIModel() {
  // Only check on server side
  if (typeof window !== 'undefined') {
    return null
  }
  // Priority: Anthropic (Claude) > OpenAI (GPT-4o) > Groq
  if (AI_PROVIDERS.anthropic.enabled) return AI_PROVIDERS.anthropic.model
  if (AI_PROVIDERS.openai.enabled) return AI_PROVIDERS.openai.model
  if (AI_PROVIDERS.groq.enabled) return AI_PROVIDERS.groq.model
  throw new Error('No AI provider configured. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY')
}

// Rate limiter factory
function createRateLimiter(identifier: string, requests = 50, window = '1 d') {
  if (typeof window !== 'undefined') {
    return null
  }
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null
  }
  
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  })
  
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(requests, window),
    analytics: true,
    prefix: `firestarter:ratelimit:${identifier}`,
  })
}

const config = {
  app: {
    name: 'Agenda Nord Vaudois',
    url: process.env.NEXT_PUBLIC_URL || 'http://localhost:3000',
    logoPath: '/firecrawl-logo-with-fire.png',
  },

  ai: {
    model: getAIModel(),
    temperature: 0.5,
    maxTokens: 3000,
    systemPrompt: `Tu es un assistant de veille pour journalistes couvrant le Nord Vaudois (Suisse).
Tu aides à produire du contenu prêt à publier : agendas, synthèses, brèves.

# Règles absolues
- Réponds UNIQUEMENT en français
- Utilise UNIQUEMENT les informations du contexte fourni
- Si l'info est insuffisante, dis-le clairement et suggère une piste
- Ne commence JAMAIS par "Bonjour" ou des formules de politesse dans les réponses structurées
- Va droit à l'essentiel : un journaliste doit pouvoir copier-coller ta réponse

# Format selon le type de demande

## Agenda / Calendrier
Commence par un résumé en une phrase ("X événements cette semaine, dont..."), puis :

**[Jour, date complète]**
- **[Heure]** — **[Événement]** | [Lieu]
  [1-2 phrases : ce qu'il faut savoir]
  [Source : nom du document ou URL]

Trie par date chronologique. Groupe par jour.

## Synthèse / Résumé (séances, décisions, documents)
Commence par **À retenir** : 3-5 points clés numérotés, avec les chiffres importants (montants CHF, dates, votes).

Puis détaille par thème avec :
- La date de la séance/décision entre parenthèses
- Les montants en gras
- Le statut : accepté, refusé, renvoyé en commission, en discussion

## Question précise
Réponds en 2-3 paragraphes max. Cite les sources entre crochets [nom du document]. Termine par "À creuser :" si des angles complémentaires existent dans les sources.

## Brève / Newsletter
Si on te demande une brève ou un texte newsletter, écris un texte fluide de 3-5 paragraphes en style journalistique (pyramide inversée : info principale d'abord, détails ensuite, contexte en fin).

# Mise en forme
- Montants : toujours "CHF X'XXX'XXX.-" avec séparateur de milliers
- Dates : "jeudi 30 octobre 2025" (jour de la semaine inclus quand disponible)
- Utilise **gras** pour les chiffres clés, noms propres importants, décisions
- Utilise les tirets cadratins (—) et non les pipes (|) pour séparer les éléments d'une ligne d'agenda

Si l'utilisateur te salue, présente-toi brièvement comme l'assistant de veille du Nord Vaudois et propose 3 questions types.`,
    providers: AI_PROVIDERS,
  },

  crawling: {
    defaultLimit: 50,
    maxLimit: 200,
    minLimit: 10,
    limitOptions: [25, 50, 100, 200],
    scrapeTimeout: 30000,
    cacheMaxAge: 86400, // 1 jour - les agendas changent souvent
  },

  search: {
    maxResults: 100,
    maxContextDocs: 15,
    maxContextLength: 3000,
    maxSourcesDisplay: 20,
    snippetLength: 300,
    maxSearchResults: 50,
    defaultSearchResults: 20,
    scoreThresholds: { high: 0.7, medium: 0.4 },
  },

  storage: {
    maxIndexes: 50,
    cacheTtlSeconds: 300,
    redisPrefix: {
      indexes: 'firestarter:indexes',
      index: 'firestarter:index:',
    },
  },

  rateLimits: {
    create: createRateLimiter('create', 20, '1 d'),
    query: createRateLimiter('query', 100, '1 h'),
    scrape: createRateLimiter('scrape', 50, '1 d'),
    pdf: createRateLimiter('pdf', 20, '1 d'),
  },

  features: {
    enableCreation: process.env.DISABLE_CHATBOT_CREATION !== 'true',
    enableRedis: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    enableSearch: !!(process.env.UPSTASH_SEARCH_REST_URL && process.env.UPSTASH_SEARCH_REST_TOKEN),
  },
}

export type Config = typeof config

// Client-safe config (no AI model initialization)
export const clientConfig = {
  app: config.app,
  crawling: config.crawling,
  search: config.search,
  storage: config.storage,
  features: config.features,
}

// Server-only config (includes AI model)
export const serverConfig = config

// Default export for backward compatibility
export { clientConfig as config }