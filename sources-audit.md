# Audit sources commune — Nord Vaudois

> Classification effectuée le 2026-05-07 par WebFetch sur les 30 URLs commune. Stratégie d'extraction par source.

## Résumé

| Catégorie | Nb | Communes |
|---|---|---|
| `ical_jsonld` (JSON-LD ou .ics natif) | **3** | Champagne, Mathod, Fontaines-sur-Grandson |
| `html_libre` (texte structuré, parsing LLM) | **14** | Bioley-Magnoux, Bonvillars, Chamblon, Champvent, Donneloye, Fiez, Montagny, Suchy, Treycovagnes, Ursins, Valeyres-sous-Montagny, Yvonand, + Cronay/Ependes (annonces mixtes) |
| `wix_dynamic` (Wix, contenu chargé en JS) | **3** | Orges, Belmont-sur-Yverdon, Vuiteboeuf |
| `vide` (page existe mais 0 event listé) | **7** | Cheseaux-Noréaz, Cuarny, Grandevent, Orzens, Suscévaz, Villars-Epeney, Vugelles-La-Mothe |
| `hors_scope` (pas Nord Vaudois) | **1** | Giez (France, .fr) |
| `special` (déjà couvert par autre source) | **1** | Yverdon-les-Bains (via API geocity.ch existante) |
| `mort` | 0 | — |

**Lecture** : 3 sources gratuites (parsing direct), 14 sources qui nécessitent LLM, 3 sources Wix qui demanderont du rendering JavaScript (Playwright ou Firecrawl mode JS), 7 sources sans valeur, 2 sources hors POC.

## Détail par commune

### 5924 Orges
- **URL** : https://www.orges.ch/manifestations
- **Catégorie** : `wix_dynamic`
- **Notes** : Wix builder, contenu chargé dynamiquement via JS, HTML statique vide
- **Stratégie** : Firecrawl en mode JS render obligatoire (option `waitFor`) → markdown → LLM `generateObject`

### 5902 Belmont-sur-Yverdon
- **URL** : https://www.belmont-sur-yverdon.ch/actualités
- **Catégorie** : `wix_dynamic`
- **Notes** : Wix Thunderbolt, contenu absent du HTML source
- **Stratégie** : Firecrawl JS render → LLM

### 5903 Bioley-Magnoux
- **URL** : https://bioley-magnoux.ch/officiel/pilier-public/
- **Catégorie** : `html_libre`
- **Notes** : Joomla, pilier public, 2 événements en texte (Tour de Romandie, programme de tir)
- **Stratégie** : Firecrawl markdown → LLM `generateObject`

### 5551 Bonvillars
- **URL** : https://bonvillars.ch/pilier-public/actualites/
- **Catégorie** : `html_libre`
- **Notes** : 10 annonces visibles (mélange events + actualités administratives)
- **Stratégie** : Firecrawl + LLM avec filtre "ignorer les avis administratifs purs"

### 5904 Chamblon
- **URL** : https://chamblon.ch/manifestations-annuelles/
- **Catégorie** : `html_libre`
- **Notes** : WordPress, 4 events annuels (Carnaval, Fête nationale, Repas commune, Noël)
- **Stratégie** : Firecrawl + LLM ; events récurrents → `recurrence: 'annuelle'`

### 5553 Champagne ⭐
- **URL** : https://champagne.ch/evenements/
- **Catégorie** : `ical_jsonld`
- **Notes** : **JSON-LD complet + .ics export + intégrations Google/Outlook**, 10 events visibles
- **Stratégie** : parser le JSON-LD `<script type="application/ld+json">` directement, ignorer le LLM. Coût ~0.

### 5905 Champvent
- **URL** : https://champvent.ch/manifestations
- **Catégorie** : `html_libre`
- **Notes** : 11 events futurs en liste plain text
- **Stratégie** : Firecrawl + LLM

### 5909 Cheseaux-Noréaz
- **URL** : https://cheseaux-noreaz.ch/accueil
- **Catégorie** : `vide`
- **Notes** : Portail informatif, pas de calendrier ; pas de section agenda dédiée
- **Stratégie** : `active=false` au seed

### 5910 Cronay
- **URL** : https://www.cronay.ch/
- **Catégorie** : `html_libre` (mais limite `vide`)
- **Notes** : 13 annonces statiques (pas vraiment des events). Récurrent : déchetterie hebdo.
- **Stratégie** : Firecrawl + LLM avec filtre "events uniquement, exclure les avis administratifs"

### 5911 Cuarny
- **URL** : https://www.cuarny.ch/vie-pratique/agenda
- **Catégorie** : `vide`
- **Notes** : Page agenda existe mais affiche "Aucune actualité disponible"
- **Stratégie** : `active=true` mais re-checker périodiquement (pas urgent)

### 5913 Donneloye
- **URL** : https://www.donneloye.ch/actualite/pilier-public
- **Catégorie** : `html_libre`
- **Notes** : 10-12 annonces avec dates précises (gendarmerie mobile, garderie, consultation publique)
- **Stratégie** : Firecrawl + LLM ; bcp de events sont des PDFs liés

### 5914 Ependes
- **URL** : https://ependesvd.ch/pilier-public/informations-generales/
- **Catégorie** : `html_libre` (limite `vide` pour cette URL précise)
- **Notes** : 0 events sur cette page mais le site a une section `/event` séparée non testée
- **Stratégie** : **changer l'URL** vers `https://ependesvd.ch/event` au seed, re-tester

### 5556 Fiez
- **URL** : https://www.fiez.ch/index.php/pilier-public
- **Catégorie** : `html_libre`
- **Notes** : Joomla, 10 annonces (élections, hommage, fermetures de routes) ; peu d'events purs
- **Stratégie** : Firecrawl + LLM avec filtre

### 5557 Fontaines-sur-Grandson ⭐
- **URL** : https://www.fontaines-sur-grandson.ch/index.php/calendrier/list.events/-
- **Catégorie** : `ical_jsonld`
- **Notes** : **Joomla JEvents**, structure `icalrepeat.detail/year/month/day/id/-/slug` ; 2 events visibles
- **Stratégie** : tester `https://www.fontaines-sur-grandson.ch/index.php/calendrier/icalrepeat/?format=ical` (URL JEvents standard d'export iCal). Sinon parser HTML structuré.

### 5559 Giez
- **URL** : https://www.giez.fr/agenda
- **Catégorie** : `hors_scope`
- **Notes** : **Domaine .fr** = commune française (Haute-Savoie). 0 events propres, affiche events alentours en France.
- **Stratégie** : `active=false`, retirer du seed Nord Vaudois (erreur dans la liste fournie)

### 5560 Grandevent
- **URL** : https://www.grandevent.ch/cms/
- **Catégorie** : `vide`
- **Notes** : 0 events ; section "News" avec annonces administratives statiques
- **Stratégie** : `active=false` ou re-check avec URL alternative

### 5919 Mathod ⭐
- **URL** : https://www.mathod.ch/events/
- **Catégorie** : `ical_jsonld`
- **Notes** : **WordPress + The Events Calendar plugin**, JSON-LD + webcal + .ics + intégrations calendrier ; 3 events visibles avec données complètes
- **Stratégie** : URL d'export `https://www.mathod.ch/?post_type=tribe_events&ical=1&eventDisplay=list` → parser iCal directement

### 5922 Montagny-près-Yverdon
- **URL** : https://www.montagny.ch/manifestations.php
- **Catégorie** : `html_libre`
- **Notes** : 3 events plain text avec dates structurées
- **Stratégie** : Firecrawl + LLM (peu d'events, coût négligeable)

### 5925 Orzens
- **URL** : https://orzens.ch/vie-locale/
- **Catégorie** : `vide`
- **Notes** : Page informative (chœur mixte, daycare), pas d'events datés
- **Stratégie** : `active=false`

### 5926 Pomy
- **URL** : https://pomy.ch/pominfo
- **Catégorie** : `vide` (à confirmer — fetch a retourné HTML boilerplate Divi sans contenu réel)
- **Notes** : WordPress Divi, contenu réel non capturé dans le fetch
- **Stratégie** : retester avec URL `https://pomy.ch/pominfo/` (slash final) ou Firecrawl mode JS

### 5929 Suchy
- **URL** : https://suchy.ch/events/
- **Catégorie** : `html_libre` (potentiel `html_structured` à confirmer)
- **Notes** : 16 events visibles, JSON-LD CollectionPage présent mais pas Event
- **Stratégie** : Firecrawl + LLM (la liste plain text est exploitable)

### 5930 Suscévaz
- **URL** : https://www.suscevaz.ch/
- **Catégorie** : `vide`
- **Notes** : Pas d'agenda dédié ; **fusion Mathod-Suscévaz au 01.01.2027** annoncée
- **Stratégie** : `active=false` au POC, deviendra obsolète en 2027

### 5931 Treycovagnes
- **URL** : https://www.treycovagnes.ch/Communication-et-agenda
- **Catégorie** : `html_libre`
- **Notes** : Widget Zabuto Calendar (AJAX), 8 events visibles dans la page rendue
- **Stratégie** : Firecrawl JS render → LLM (Zabuto charge en AJAX)

### 5932 Ursins
- **URL** : https://www.ursins.ch/calendrier/
- **Catégorie** : `html_libre`
- **Notes** : Calendrier 20+ events plain text (élections, jeunesse, déchets, fête nationale)
- **Stratégie** : Firecrawl + LLM (riche)

### 5933 Valeyres-sous-Montagny
- **URL** : https://valeyres-sous-montagny.ch/infos-communales-pilier-public/actualites-communales
- **Catégorie** : `html_libre`
- **Notes** : 5 events visibles
- **Stratégie** : Firecrawl + LLM

### 5935 Villars-Epeney
- **URL** : https://www.villars-epeney.ch/index.php/autorites/administration/calendrier-communal
- **Catégorie** : `vide`
- **Notes** : Joomla mais sans extension calendrier ; titre "Calendrier communal" mais 0 contenu
- **Stratégie** : `active=false`

### 5937 Vugelles-La-Mothe
- **URL** : https://vugelleslamothe.ch/agenda/
- **Catégorie** : `vide` (mais infrastructure prête)
- **Notes** : WordPress + The Events Calendar plugin déjà installé, **mais aucun event publié actuellement**
- **Stratégie** : `active=true`, re-check fréquent, sera traité comme Mathod dès qu'il y aura des events

### 5766 Vuiteboeuf
- **URL** : https://www.vuiteboeuf.ch/agenda
- **Catégorie** : `wix_dynamic`
- **Notes** : Wix Thunderbolt, contenu non capturé en HTML statique
- **Stratégie** : Firecrawl mode JS render → LLM

### 5938 Yverdon-les-Bains ⭐
- **URL** : https://www.yverdon-les-bains.ch/medias/agenda
- **Catégorie** : `special`
- **Notes** : Widget "agenda-embed" tiers ; **l'API geocity.ch est déjà utilisée par le projet existant** (cf. `lib/geocity.ts`, 183 events importés au dernier crawl)
- **Stratégie** : **conserver l'intégration `geocity://yverdon` existante**, ne pas re-scraper le site

### 5939 Yvonand
- **URL** : https://yvonand.ch/yvonand-au-quotidien/pilier-public/
- **Catégorie** : `html_libre`
- **Notes** : 50/85 events visibles (paginé), riche en données
- **Stratégie** : Firecrawl + LLM ; gérer la pagination (tester `?page=2`...)

## Recommandations Marc avant J1

### 1. Prioriser les 4 sources gratuites au J2

Les sources **`ical_jsonld`** (Champagne, Mathod, Fontaines-sur-Grandson) + **`special`** (Yverdon via geocity) couvrent ~200+ events à coût quasi nul. Ces 4 sources doivent être branchées en premier — elles valident le pipeline sans dépendance LLM.

```
J2 — Marc :
  - parser JSON-LD Champagne
  - parser iCal Mathod via tribe_events?ical=1
  - parser iCal Fontaines-sur-Grandson via JEvents export
  - réutiliser geocity pour Yverdon
```

### 2. Filtrer la liste des sources : retirer 9 communes du seed actif

À marquer `active=false` au seed pour économiser le crawl :
- **Giez** (.fr, hors scope)
- **Cheseaux-Noréaz, Grandevent, Orzens, Suscévaz, Villars-Epeney, Vugelles-La-Mothe** (pas d'events)
- **Cuarny** (page existe mais 0 contenu actuel — re-check mensuel)
- **Pomy** (à reverifier avec une autre URL)

Ne reste actif au POC : **20 sources** (3 ical + 14 html_libre + 3 wix).

### 3. Décision Wix : Firecrawl mode JS ou retrait

**Orges, Belmont-sur-Yverdon, Vuiteboeuf** sont sur Wix Thunderbolt = HTML statique vide. Deux options :
- **(a)** Firecrawl avec `waitFor` ou Playwright → coûte plus cher en crawl mais récupère le DOM rendu
- **(b)** retirer du POC ces 3 communes, focus sur les 17 sources facilement scrapable

**Recommandation Marc** : option (a) uniquement pour Vuiteboeuf qui a une page `/agenda` dédiée. Orges et Belmont ont des pages "actualités" génériques où l'événement vrai n'est pas distingué — ROI faible.

### 4. Coût estimé LLM pour les 14 sources `html_libre`

Hypothèse : ~10 events moyens par commune × 14 communes × 1 crawl/jour = 140 events/jour à classifier via Claude.

- Claude Sonnet 4.5 : ~0.003$ par event (input + output structuré court)
- Coût mensuel : 140 × 30 × 0.003 = **~12.6 USD/mois**

Si on ajoute la dédup et la re-classification au moindre changement, prévoir **20-30 USD/mois** d'enveloppe LLM. Acceptable pour un POC.

### 5. URL d'export iCal à tester en J0+

Avant de coder, valider à la main que ces URLs retournent bien du iCal valide :
- `https://www.fontaines-sur-grandson.ch/index.php/calendrier/icalrepeat/?format=ical`
- `https://www.mathod.ch/?post_type=tribe_events&ical=1&eventDisplay=list`
- `https://champagne.ch/?ical=1` ou tester `<a href>` direct sur la page

Si les URLs marchent → parser iCal direct (lib `node-ical`). Sinon fallback parsing JSON-LD.
