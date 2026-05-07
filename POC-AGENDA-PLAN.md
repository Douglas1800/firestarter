# POC Agenda Événements Nord Vaudois — Plan d'exécution (v2 révisé)

> Document de spécifications validé après 4 rounds de questions avec l'équipe (Sarah Tech Lead, Marc Dev Back, Léa Dev Front), puis revue critique pour simplification.

## Contexte

Pivot du projet `rag-express` (RAG multi-index thématique) vers un **POC agenda d'événements structuré** pour journalistes du Nord Vaudois. Le RAG actuel est mis en pause et sera rebranché en V2 sur la table `events`.

## Décisions verrouillées

| Sujet | Choix |
|---|---|
| Périmètre | Extension de `rag-express`, séparation via route groups `(events)` / `(rag)` |
| DB | **Vercel Postgres (Neon)** — pas de PostGIS, lat/lng en floats |
| ORM | **Drizzle** (schéma TS = source de vérité) |
| Extraction LLM | **`generateObject` + Zod** (Vercel AI SDK), pas de prompt JSON brut |
| Scraping FB | Apify Facebook Events Scraper, **pages publiques uniquement** |
| Vue principale | Liste chronologique + filtres |
| Catégories | Culture / Sport / Politique / Marché / Autre |
| Dédup | **Manuelle** (pas d'UI fusion au POC, V2) ; UNIQUE intra-source via `(source_id, date_debut, lower(nom))` |
| Géocodage | Nominatim avec cache DB ; **pré-géocodage des communes au seed**, lazy event-level si adresse précise |
| Photos | URL source seule (FB images peuvent expirer, accepté pour POC) |
| Cron | **Un seul Vercel Cron 5h** qui appelle Apify run-sync (pas de webhook Apify) |
| Auth | Aucune (URL secrète, middleware optionnel `?key=xxx`) |
| Score qualité | Heuristique simple : `(nb_sources × 2) + (taux_remplissage × 10) + (geo ? 5 : 0)` |
| Popularité | `nb_sources` (interested_count FB en V2) |
| RAG | En pause, code isolé dans `app/(rag)/` |
| Sources POC | ~30 communes via sites web + 3 pages FB publiques (groupes FB privés exclus) |
| Récurrence | 1 row + champs `recurrence` + `date_fin` ; helper `nextOccurrence()` côté front |
| Action manuelle | Bouton "lancer crawl maintenant" sur /events |
| Filtres | Période + catégorie (multi) + commune + recherche texte |

## Schéma Postgres (allégé, 3 tables)

```sql
CREATE TABLE sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commune         text NOT NULL,
  code_ofs        int,
  type            text NOT NULL CHECK (type IN ('site_agenda','site_actu','fb_page','fb_group','ical','rss')),
  url             text NOT NULL UNIQUE,
  active          boolean DEFAULT true,
  -- centre commune pré-géocodé une fois (fallback si event sans adresse précise)
  commune_lat     float,
  commune_lng     float,
  last_crawl_at   timestamptz,
  last_crawl_status text CHECK (last_crawl_status IN ('ok','error','empty')),
  last_crawl_error text
);

CREATE TABLE events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id          uuid REFERENCES sources(id),
  source_url         text,
  nom                text NOT NULL,
  description_courte text,
  description_longue text,
  photo_url          text,
  date_debut         date NOT NULL,
  heure_debut        time,
  date_fin           date,
  heure_fin          time,
  lieu_nom           text,
  adresse            text,
  lat                float,
  lng                float,
  categorie          text NOT NULL CHECK (categorie IN ('culture','sport','politique','marche','autre')),
  recurrence         text DEFAULT 'aucune' CHECK (recurrence IN ('aucune','quotidienne','hebdo','mensuelle','custom')),
  prix               text,
  popularite         int DEFAULT 0,
  score_qualite      int DEFAULT 0,
  hidden             boolean DEFAULT false,
  edited             boolean DEFAULT false,
  crawled_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE(source_id, date_debut, lower(nom))   -- dédup intra-source
);

CREATE INDEX idx_events_date    ON events(date_debut) WHERE NOT hidden;
CREATE INDEX idx_events_source  ON events(source_id);

CREATE TABLE geocode_cache (
  adresse_normalized text PRIMARY KEY,
  lat                float,
  lng                float,
  resolved_at        timestamptz DEFAULT now()
);
```

> Note : table `event_sources` (N:N) volontairement retirée du POC. Sera réintroduite en V2 lors de la fusion manuelle des doublons.

## Architecture des routes

```
app/
├── (events)/                       # NEW - route group POC
│   ├── events/page.tsx             # liste chrono + filtres + bouton crawl
│   ├── events/[id]/page.tsx        # détail event
│   └── admin/sources/page.tsx      # CRUD sources
├── (rag)/                          # MOVED - code RAG existant isolé
│   ├── dashboard/...
│   ├── indexes/...
│   └── manage/...
└── api/
    ├── events/
    │   ├── route.ts                # GET liste filtrée, PATCH masquer/éditer
    │   └── export/route.ts         # GET ?format=csv|md
    ├── crawl/route.ts              # POST manuel + GET cron Vercel (orchestre tout)
    ├── geocode/route.ts            # POST adresse → lat/lng (avec cache)
    └── firestarter/...             # EXISTANT - inchangé pour le moment
```

## Liste des sources à seeder

### Sites communes (sites web)

| Code OFS | Commune | URL agenda |
|---|---|---|
| 5924 | Orges | https://www.orges.ch/manifestations |
| 5902 | Belmont-sur-Yverdon | https://www.belmont-sur-yverdon.ch/actualités |
| 5903 | Bioley-Magnoux | https://bioley-magnoux.ch/officiel/pilier-public/ |
| 5551 | Bonvillars | https://bonvillars.ch/pilier-public/actualites/#archives |
| 5904 | Chamblon | https://chamblon.ch/manifestations-annuelles/ |
| 5553 | Champagne | https://champagne.ch/evenements/ |
| 5905 | Champvent | https://champvent.ch/manifestations |
| 5909 | Cheseaux-Noréaz | https://cheseaux-noreaz.ch/accueil |
| 5910 | Cronay | https://www.cronay.ch/ |
| 5911 | Cuarny | https://www.cuarny.ch/vie-pratique/agenda |
| 5913 | Donneloye | https://www.donneloye.ch/actualite/pilier-public |
| 5914 | Ependes | https://ependesvd.ch/pilier-public/informations-generales/ |
| 5556 | Fiez | https://www.fiez.ch/index.php/pilier-public |
| 5557 | Fontaines-sur-Grandson | https://www.fontaines-sur-grandson.ch/index.php/calendrier/list.events/- |
| 5559 | Giez | https://www.giez.fr/agenda |
| 5560 | Grandevent | https://www.grandevent.ch/cms/ |
| 5919 | Mathod | https://www.mathod.ch/events/ |
| 5922 | Montagny-près-Yverdon | https://www.montagny.ch/manifestations.php |
| 5925 | Orzens | https://orzens.ch/vie-locale/ |
| 5926 | Pomy | https://pomy.ch/pominfo#titre-pominfo |
| 5929 | Suchy | https://suchy.ch/events/ |
| 5930 | Suscévaz | https://www.suscevaz.ch/ |
| 5931 | Treycovagnes | https://www.treycovagnes.ch/Communication-et-agenda#_4 |
| 5932 | Ursins | https://www.ursins.ch/calendrier/ |
| 5933 | Valeyres-sous-Montagny | https://valeyres-sous-montagny.ch/infos-communales-pilier-public/actualites-communales |
| 5935 | Villars-Epeney | https://www.villars-epeney.ch/index.php/autorites/administration/calendrier-communal |
| 5937 | Vugelles-La Mothe | https://vugelleslamothe.ch/agenda/ |
| 5766 | Vuiteboeuf | https://www.vuiteboeuf.ch/agenda |
| 5938 | Yverdon-les-Bains | https://www.yverdon-les-bains.ch/medias/agenda#/ |
| 5939 | Yvonand | https://yvonand.ch/yvonand-au-quotidien/pilier-public/ |

### Pages Facebook publiques (POC)

| Commune | Page FB |
|---|---|
| Yverdon-les-Bains | https://www.facebook.com/villeyverdonlesbains/ |
| Yvonand | https://www.facebook.com/CommuneYvonand/ |
| Donneloye | https://www.facebook.com/villajoye.ch |

### Exclus du POC (V2)

Tous les groupes Facebook privés de la liste fournie : risque légal/ban + Apify ne peut pas y accéder sans authentification dans chaque groupe.

## J0 — Audit avant code (Marc, ~30 min)

Avant d'écrire la moindre ligne, classer chacune des 30 URLs commune dans une de ces catégories :

| Type | Stratégie d'extraction | Coût |
|---|---|---|
| `ical` (.ics exposé) | parser direct iCal | quasi nul |
| `rss` (flux RSS) | parser XML | quasi nul |
| `html_structured` (microdata, JSON-LD, classes claires) | cheerio + sélecteurs | faible |
| `html_libre` (texte mélangé) | Firecrawl markdown + LLM `generateObject` | élevé |
| `vide` ou `mort` (404, page placeholder) | désactiver `active=false`, log |

**Output** : un fichier `sources-audit.md` avec le type retenu par commune. Permet d'estimer le coût Apify+LLM avant le scale.

## Découpage en tickets

### Marc (back) — pipeline ingestion

1. Audit J0 des 30 sources → `sources-audit.md`
2. Setup Vercel Postgres + Drizzle (schéma ci-dessus)
3. Migration + seed `sources` (+ pré-géocodage centres communes via Nominatim)
4. Lib `lib/scrapers/ical.ts` — parser iCal pour sites avec `.ics`
5. Lib `lib/scrapers/html.ts` — Firecrawl + `generateObject` Zod pour HTML libre
6. Lib `lib/scrapers/apify-fb.ts` — Apify run-sync API call + mapping vers schema
7. Lib `lib/geocode.ts` — Nominatim avec cache `geocode_cache` + rate limit 1/s
8. Lib `lib/scoring.ts` — score qualité heuristique
9. Endpoint `/api/crawl` — orchestre toutes les sources (parallélisation contrôlée)
10. `vercel.json` cron 5h sur `/api/crawl?source=cron`

### Léa (front) — UI journaliste

1. Migration `app/(rag)/` pour isoler le code existant
2. Page `/events` — liste + filtres (période, catégorie, commune, search)
3. Composant `EventCard` (nom, date, lieu, source, badge catégorie)
4. Helper `nextOccurrence(event, fromDate)` pour la récurrence
5. Page `/events/[id]` — détail + bouton "masquer"
6. Bouton "Lancer crawl maintenant" + toast progression
7. Page `/admin/sources` — table des sources (status, dernière exécution, erreur)
8. Export CSV / Markdown
9. Nav principale : `/events` devient l'entrée par défaut

### Sarah (tech lead) — transverse

1. Cleanup lockfiles : garder `package-lock.json`, supprimer `bun.lockb` + `pnpm-lock.yaml`
2. Setup Vercel Postgres + variables d'env
3. Setup compte Apify + actor + token
4. Validation schéma Drizzle + revue PRs
5. Mise à jour `CLAUDE.md` (nouveau schéma, architecture, cron)
6. Tests Playwright minimaux : liste s'affiche, filtres fonctionnent, crawl manuel renvoie 200

## Ordre d'attaque

1. **J0** : Sarah cleanup lockfiles. Marc fait l'audit des 30 sources. Léa migre le code RAG dans `app/(rag)/`.
2. **J1** : Sarah setup Vercel Postgres + env. Marc écrit le schéma Drizzle + migration + seed sources avec pré-géocodage. Léa stub `/events` avec données mockées.
3. **J2** : Marc branche le scraper iCal/RSS (gain rapide) puis HTML pour Yverdon. Léa branche `/events` sur `/api/events`.
4. **J3** : Marc ajoute Apify FB (3 pages publiques) + scoring qualité. Léa fait page détail + filtres + helper récurrence.
5. **J4** : Marc étend le scraping aux 30 sources + cron Vercel. Léa fait export CSV/MD + bouton crawl manuel.
6. **J5** : Bug bash, tests Playwright, déploiement Vercel, configuration cron en prod.

## Risques identifiés et mitigations

| Risque | Mitigation |
|---|---|
| Sites communes hétérogènes (HTML pourri) | Audit J0 + extraction `generateObject` Zod (sortie typée garantie) |
| Apify FB coûteux à scale | Plafond budget Apify + scope POC limité aux 3 pages publiques |
| Doublons sans dédup auto | UI "potential duplicates" en V2 ; au POC accepter et documenter |
| Timezone (CH vs UTC) | DB en `timestamptz`, front toujours `Europe/Zurich` (`date-fns-tz`) |
| Adresses incomplètes → pas de géoloc précise | Fallback sur `commune_lat/lng` ; score qualité reflète l'absence |
| Vercel Cron 5 min trop court pour 30 sites en LLM séquentiel | Parallélisation `Promise.all` par batch de 5 sources + early return par source |
| FB images expirent (~24-72h) | Accepté au POC ; V2 = download + Vercel Blob |
| Groupes FB privés inaccessibles | Marqués `active=false` au seed, exclus du crawl |

## Variables d'environnement à ajouter

```
# Vercel Postgres (auto-provisionné par Vercel)
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=

# Apify
APIFY_TOKEN=
APIFY_FB_EVENTS_ACTOR_ID=apify/facebook-events-scraper

# Sécurité
CRAWL_TRIGGER_SECRET=        # protège POST /api/crawl

# Nominatim (politesse OSM)
NOMINATIM_USER_AGENT=        # ex: "agenda-nv-poc/1.0 contact@example.ch"
```

## Hors scope POC (à reprendre en V2)

- Dédup automatique (fuzzy matching ou embeddings)
- UI fusion manuelle des doublons + table `event_sources` (N:N)
- Re-branchement du chat RAG sur la table `events`
- Auth journaliste (Supabase magic link ou middleware)
- Vue calendrier et vue carte (Leaflet/Mapbox)
- Édition manuelle des événements
- Notifications nouveaux événements (email / Slack)
- Score qualité via LLM
- Téléchargement et persistance des photos (Vercel Blob)
- Likes / interested_count Facebook dans la popularité
- Scraping des groupes FB privés

## TL;DR des simplifications vs v1

| # | Action | Impact |
|---|---|---|
| 1 | Vercel Postgres au lieu de Supabase | -1 vendor |
| 2 | Drizzle ORM | type safety |
| 3 | `generateObject` + Zod au lieu de prompt JSON | fiabilité |
| 4 | Un seul Vercel Cron synchrone | -1 webhook |
| 5 | Pré-géocodage communes au seed | crawl 10× + rapide |
| 6 | lat/lng floats au lieu de PostGIS | -dépendance |
| 7 | Suppression `event_sources` (V2) | -1 table |
| 8 | UNIQUE composite intra-source | dédup gratuite |
| 9 | Audit J0 des 30 sites | économies LLM |
| 10 | FB pages publiques only | -risque ban |
| 11 | 1 seul lockfile | -bugs CI |
| 12 | Route groups `(events)` / `(rag)` | code propre |
