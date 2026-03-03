# Agenda Nord Vaudois

Assistant de veille IA pour journalistes couvrant le Nord Vaudois. Crawle des sites web, indexe le contenu, et fournit un chatbot RAG pour interroger les sources.

**Stack** : Next.js 15 / Firecrawl / Upstash Vector / Vercel AI SDK / Claude (Anthropic)

---

## Prérequis

- **Node.js 20+** (testé avec v22)
- **npm** (inclus avec Node)
- Un compte sur chaque service ci-dessous (plans gratuits suffisants pour commencer)

---

## 1. Cloner le repo

```bash
git clone <url-du-repo>
cd rag-express
```

---

## 2. Créer les comptes et récupérer les clés API

### a) Firecrawl (crawling de sites web)

1. Aller sur https://www.firecrawl.dev
2. Créer un compte
3. Aller dans **API Keys** : https://www.firecrawl.dev/app/api-keys
4. Copier la clé (commence par `fc-...`)

### b) Upstash (base de données vectorielle)

1. Aller sur https://console.upstash.com
2. Créer un compte
3. Créer un **Vector Index** :
   - Cliquer sur **Vector** dans le menu
   - **Create Index**
   - Nom : `agenda-nord-vaudois` (ou ce que tu veux)
   - Region : **EU-West-1** (pour la Suisse, c'est le plus proche)
   - Dimensions : laisser le défaut ou choisir un modèle d'embedding (le projet utilise l'embedding intégré d'Upstash)
4. Une fois créé, aller dans l'onglet **Details** et copier :
   - `UPSTASH_VECTOR_REST_URL` → c'est ton `UPSTASH_SEARCH_REST_URL`
   - `UPSTASH_VECTOR_REST_TOKEN` → c'est ton `UPSTASH_SEARCH_REST_TOKEN`

> **Optionnel** : Tu peux aussi créer une base **Redis** sur Upstash pour le stockage persistant des index (rate limiting, etc.). Sans Redis, le projet fonctionne quand même avec un stockage fichier local.

### c) LLM Provider (au moins un)

Le projet supporte 3 providers avec cet ordre de priorité :

| Priorité | Provider   | Modèle                  | Lien                                          |
|----------|------------|-------------------------|-----------------------------------------------|
| 1        | Anthropic  | Claude Sonnet 4.5       | https://console.anthropic.com/settings/keys   |
| 2        | OpenAI     | GPT-4o                  | https://platform.openai.com/api-keys          |
| 3        | Groq       | Llama 4 Scout           | https://console.groq.com/keys                 |

Il suffit d'en configurer **un seul**. On utilise Anthropic (Claude).

---

## 3. Configurer les variables d'environnement

Copier le fichier d'exemple :

```bash
cp .env.local.example .env.local
```

Puis remplir `.env.local` avec tes clés :

```env
# --- Firecrawl (REQUIS) ---
FIRECRAWL_API_KEY=fc-ta-cle-ici

# --- Upstash Vector (REQUIS) ---
UPSTASH_SEARCH_REST_URL=https://ton-index.upstash.io
UPSTASH_SEARCH_REST_TOKEN=ta-cle-ici

# --- Upstash Redis (OPTIONNEL) ---
# UPSTASH_REDIS_REST_URL=https://ton-redis.upstash.io
# UPSTASH_REDIS_REST_TOKEN=ta-cle-ici

# --- LLM (au moins UN requis) ---
ANTHROPIC_API_KEY=sk-ant-ta-cle-ici
# OPENAI_API_KEY=sk-...
# GROQ_API_KEY=gsk_...
```

---

## 4. Installer et lancer

```bash
npm install
npm run dev
```

Ouvrir http://localhost:3000

---

## Utilisation

1. **Créer un index** : Sur la page d'accueil, entre l'URL d'un site à crawler (ex: `https://echandole.ch`). Firecrawl va parcourir les pages et les indexer dans Upstash.
2. **Interroger** : Une fois l'index créé, pose des questions dans le chat. Le système cherche les documents pertinents et génère une réponse avec Claude.
3. **Gérer les index** : Va sur `/manage` pour voir, rafraîchir ou supprimer les index existants.

---

## Structure du projet

```
app/
├── api/firestarter/
│   ├── create/       # API de crawling et indexation
│   ├── query/        # API de recherche RAG
│   ├── geocity/      # Import depuis Geocity
│   └── pdf/          # Import de PDFs
├── dashboard/        # Page dashboard
├── indexes/          # Liste des index
├── manage/           # Gestion des index
└── page.tsx          # Page d'accueil
lib/
├── storage.ts        # Stockage des métadonnées (Redis / fichier local)
└── upstash-search.ts # Client Upstash Vector
firestarter.config.ts # Config centrale (prompts, limites, providers)
```

---

## Config avancée

La config se trouve dans `firestarter.config.ts`. Tu peux modifier :
- Le **system prompt** du chatbot (section `ai.systemPrompt`)
- Les **limites de crawl** (section `crawling`)
- Les **paramètres de recherche** (section `search`)

---

## Déploiement sur Vercel

1. Push le repo sur GitHub
2. Importer le projet sur https://vercel.com/new
3. Ajouter les variables d'environnement (les mêmes que `.env.local`)
4. Déployer

---

## Troubleshooting

| Problème | Solution |
|----------|----------|
| `No AI provider configured` | Vérifie qu'au moins une clé LLM est dans `.env.local` |
| Erreur Upstash au crawl | Vérifie `UPSTASH_SEARCH_REST_URL` et `..._TOKEN` |
| Le chat ne répond pas | Vérifie la clé Anthropic / OpenAI / Groq |
| `FIRECRAWL_API_KEY` invalide | Regénère la clé sur firecrawl.dev |
