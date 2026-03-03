# CLAUDE.md - Agenda Nord Vaudois

## Projet

Outil de veille IA pour journalistes couvrant le Nord Vaudois (Suisse). Crawle des sites web, indexe le contenu dans une base vectorielle, et fournit un chatbot RAG + une recherche vectorielle pure.

## Stack

- **Framework** : Next.js 15 (App Router, Turbopack)
- **UI** : Tailwind CSS 4 + Radix UI + shadcn/ui
- **Crawling** : Firecrawl (`@mendable/firecrawl-js`)
- **Base vectorielle** : Upstash Vector (`@upstash/vector`)
- **Stockage métadonnées** : Upstash Redis (optionnel) ou fichier local `.data/indexes.json`
- **LLM** : Anthropic Claude (priorité 1) > OpenAI > Groq, via Vercel AI SDK
- **Langue** : TypeScript strict, interface en français

## Commandes

```bash
npm run dev          # Serveur dev (Turbopack) sur :3000
npm run build        # Build production
npm run lint         # ESLint
npm run test:e2e     # Tests Playwright
```

## Architecture

### Pages (app/)

| Route | Rôle |
|-------|------|
| `page.tsx` | Accueil - sélection de thème + ajout de sources + lancement du crawl |
| `dashboard/page.tsx` | Chat IA + recherche vectorielle + panneau sources |
| `indexes/page.tsx` | Liste des index créés |
| `manage/` | Gestion des index (rafraîchir, supprimer, ajouter des sources) |

### API (app/api/firestarter/)

| Route | Rôle |
|-------|------|
| `create/route.ts` | Crawl Firecrawl + indexation dans Upstash Vector |
| `query/route.ts` | **Endpoint principal** - 2 modes : `mode: 'chat'` (RAG avec LLM) et `mode: 'search'` (résultats vectoriels bruts) |
| `geocity/route.ts` | Import depuis l'API geocity.ch (événements Yverdon) |
| `pdf/route.ts` | Extraction et indexation de PDFs |

### Libs (lib/)

| Fichier | Rôle |
|---------|------|
| `upstash-search.ts` | Client Upstash Vector : upsert, search, discover namespaces, delete |
| `storage.ts` | Stockage des métadonnées d'index (3 adapters : Redis > VectorCache > File) |

### Config

`firestarter.config.ts` : Config centralisée (system prompt IA ligne 69-111, limites de crawl, paramètres de recherche, rate limits, providers LLM).

## Conventions

- **Langue UI** : Français (le system prompt, les labels, les toasts)
- **Namespace** : Chaque index a un namespace unique (ex: `agenda-culturel-nv`), utilisé comme filtre dans les requêtes vectorielles
- **Stockage** : Le projet fonctionne sans Redis grâce au `VectorCacheStorageAdapter` qui utilise `.data/indexes.json` comme cache avec TTL de 5min, synchronisé depuis la DB vectorielle
- **Composants UI** : dans `components/ui/` (shadcn) et `components/` (custom)
- **Boutons dans un `<form>`** : toujours mettre `type="button"` sauf pour le submit, sinon le clic déclenche la soumission du formulaire

## Variables d'environnement (.env.local)

```
FIRECRAWL_API_KEY=         # Requis - clé Firecrawl
UPSTASH_SEARCH_REST_URL=   # Requis - URL de l'index vectoriel Upstash
UPSTASH_SEARCH_REST_TOKEN= # Requis - Token de l'index vectoriel
UPSTASH_REDIS_REST_URL=    # Optionnel - Redis pour stockage persistant
UPSTASH_REDIS_REST_TOKEN=  # Optionnel
ANTHROPIC_API_KEY=         # Au moins un LLM requis (priorité 1)
OPENAI_API_KEY=            # Priorité 2
GROQ_API_KEY=              # Priorité 3
```

## Pièges connus

- Le favicon `yverdon-les-bains.ch/favicon.ico` retourne 404 → spam de logs stderr (cosmétique, pas bloquant)
- Les boutons dans les `<form>` doivent avoir `type="button"` explicite pour éviter une soumission involontaire (bug corrigé dans `ModeToggle`)
- Le `mode` du dashboard (`'chat'` | `'search'`) est un state React : quand on est en mode recherche avec des résultats affichés, la barre de recherche est dans la vue résultats (pas dans le panneau chat)
