import { Calendar, MapPin, Tag } from 'lucide-react'

type Categorie = 'culture' | 'sport' | 'politique' | 'marche' | 'autre'

type MockEvent = {
  id: string
  nom: string
  descriptionCourte: string
  dateDebut: string // ISO
  heureDebut: string | null
  lieuNom: string
  commune: string
  categorie: Categorie
  source: string
}

// Stub : remplacé en J2 par fetch vers /api/events
const MOCK_EVENTS: MockEvent[] = [
  {
    id: '1',
    nom: 'Giron de l\'Arnon — 150ème de la Concorde',
    descriptionCourte: 'Festivités du 150e anniversaire avec concert et soirée villageoise.',
    dateDebut: '2026-05-08',
    heureDebut: '18:00',
    lieuNom: 'Place du village',
    commune: 'Champagne',
    categorie: 'culture',
    source: 'champagne.ch',
  },
  {
    id: '2',
    nom: 'Tournoi d\'ouverture de pétanque',
    descriptionCourte: 'Tournoi populaire ouvert à toutes et tous, inscriptions sur place.',
    dateDebut: '2026-06-06',
    heureDebut: '09:00',
    lieuNom: 'Boulodrome',
    commune: 'Champagne',
    categorie: 'sport',
    source: 'champagne.ch',
  },
  {
    id: '3',
    nom: 'Opération Coup de balai 2026',
    descriptionCourte: 'Nettoyage de printemps de la commune. Inscription jusqu\'au 12 mars.',
    dateDebut: '2026-03-18',
    heureDebut: '14:00',
    lieuNom: 'Grande salle',
    commune: 'Mathod',
    categorie: 'autre',
    source: 'mathod.ch',
  },
  {
    id: '4',
    nom: 'Classiques de Mathod 2026',
    descriptionCourte: 'Course pédestre annuelle autour du village.',
    dateDebut: '2026-05-24',
    heureDebut: null,
    lieuNom: 'Centre village',
    commune: 'Mathod',
    categorie: 'sport',
    source: 'mathod.ch',
  },
  {
    id: '5',
    nom: 'Conseil communal — séance ordinaire',
    descriptionCourte: 'Ordre du jour : budget 2027, plan partiel d\'affectation Vert-Bois.',
    dateDebut: '2026-06-15',
    heureDebut: '20:00',
    lieuNom: 'Salle communale',
    commune: 'Valeyres-sous-Montagny',
    categorie: 'politique',
    source: 'valeyres-sous-montagny.ch',
  },
  {
    id: '6',
    nom: 'Marché artisanal — paysannes vaudoises',
    descriptionCourte: 'Produits du terroir, artisanat local.',
    dateDebut: '2026-05-09',
    heureDebut: '09:00',
    lieuNom: 'Place de la Couronne',
    commune: 'Suchy',
    categorie: 'marche',
    source: 'suchy.ch',
  },
  {
    id: '7',
    nom: 'Fête nationale 2026',
    descriptionCourte: 'Discours, cortège aux lampions, feu et restauration.',
    dateDebut: '2026-08-01',
    heureDebut: '18:00',
    lieuNom: 'Place du village',
    commune: 'Champagne',
    categorie: 'culture',
    source: 'champagne.ch',
  },
]

const CATEGORIE_LABELS: Record<Categorie, string> = {
  culture: 'Culture',
  sport: 'Sport',
  politique: 'Politique',
  marche: 'Marché',
  autre: 'Autre',
}

const CATEGORIE_COLORS: Record<Categorie, string> = {
  culture: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  sport: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  politique: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  marche: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  autre: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
}

function EventCard({ event }: { event: MockEvent }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${CATEGORIE_COLORS[event.categorie]}`}
            >
              <Tag className="h-3 w-3" />
              {CATEGORIE_LABELS[event.categorie]}
            </span>
            <span className="text-xs text-muted-foreground">{event.commune}</span>
          </div>
          <h3 className="font-semibold text-base leading-snug mb-1">{event.nom}</h3>
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
            {event.descriptionCourte}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(event.dateDebut)}
              {event.heureDebut && ` — ${event.heureDebut}`}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.lieuNom}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-border/50 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Source : {event.source}</span>
      </div>
    </article>
  )
}

export default function EventsPage() {
  const sortedEvents = [...MOCK_EVENTS].sort((a, b) =>
    a.dateDebut.localeCompare(b.dateDebut)
  )

  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Agenda Nord Vaudois</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {sortedEvents.length} événements à venir — données mockées (J1 stub)
        </p>
      </header>

      <div className="space-y-3">
        {sortedEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      <footer className="mt-12 text-center text-xs text-muted-foreground">
        Branchement API <code className="font-mono">/api/events</code> prévu en J2.
      </footer>
    </main>
  )
}
