"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStorage } from "@/hooks/useStorage";
import { clientConfig as config } from "@/firestarter.config";
import {
  Loader2,
  CheckCircle2,
  FileText,
  AlertCircle,
  Plus,
  Trash2,
  Calendar,
  Landmark,
  Music,
  Newspaper,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Thèmes d'agenda pré-configurés
// Sources spéciales utilisant des API directes (pas de crawl Firecrawl)
const GEOCITY_SOURCE = "geocity://yverdon";

const AGENDA_THEMES = [
  {
    id: "agenda-culturel-nv",
    label: "Agenda Culturel",
    description: "Concerts, spectacles, expositions, festivals du Nord Vaudois",
    icon: Music,
    color: "from-purple-500 to-pink-500",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    iconColor: "text-purple-600",
    suggestedSources: [
      GEOCITY_SOURCE,
      "https://yverdonlesbainsregion.ch/agenda/",
      "https://echandole.ch",
      "https://www.amalgameclub.ch/programme/",
      "https://www.lamarive.ch/manifestations",
      "https://www.theatrebenno.ch",
    ],
  },
  {
    id: "agenda-politique-nv",
    label: "Agenda Politique",
    description: "Conseil communal, votations, séances publiques",
    icon: Landmark,
    color: "from-blue-500 to-indigo-500",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    iconColor: "text-blue-600",
    suggestedSources: [
      "https://www.yverdon-les-bains.ch/autorites",
      "pdf://www.yverdon-les-bains.ch/vie-politique/conseil-communal/seances",
      "https://www.vd.ch/toutes-les-actualites",
      "https://www.grandson.ch",
    ],
  },
];

interface SourceResult {
  label: string;
  count: number;
  done: boolean;
}

interface CrawlProgress {
  status: string;
  pagesFound: number;
  pagesScraped: number;
  currentPage?: string;
  currentSource?: string;
  sourcesTotal?: number;
  sourcesDone?: number;
  sourceResults?: SourceResult[];
}

export default function AgendaPage() {
  const router = useRouter();
  const { saveIndex } = useStorage();

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([""]);
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageLimit, setPageLimit] = useState(config.crawling.defaultLimit);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [firecrawlApiKey, setFirecrawlApiKey] = useState<string>("");
  const [isValidatingApiKey, setIsValidatingApiKey] = useState(false);
  const [hasFirecrawlKey, setHasFirecrawlKey] = useState(false);
  const [isCreationDisabled, setIsCreationDisabled] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    fetch("/api/check-env")
      .then((res) => res.json())
      .then((data) => {
        setIsCreationDisabled(data.environmentStatus.DISABLE_CHATBOT_CREATION || false);
        const hasEnvFirecrawl = data.environmentStatus.FIRECRAWL_API_KEY;
        setHasFirecrawlKey(hasEnvFirecrawl);
        if (!hasEnvFirecrawl) {
          const savedKey = localStorage.getItem("firecrawl_api_key");
          if (savedKey) {
            setFirecrawlApiKey(savedKey);
            setHasFirecrawlKey(true);
          }
        }
      })
      .catch(() => setIsCreationDisabled(false));
  }, []);

  const theme = AGENDA_THEMES.find((t) => t.id === selectedTheme);

  const addSource = () => {
    if (newSourceUrl.trim()) {
      let normalizedUrl = newSourceUrl.trim();
      if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://") && !normalizedUrl.startsWith("pdf://") && !normalizedUrl.startsWith("geocity://")) {
        normalizedUrl = "https://" + normalizedUrl;
      }
      // Validate URL (skip for special prefixes)
      if (!normalizedUrl.startsWith("pdf://") && !normalizedUrl.startsWith("geocity://")) {
        try {
          new URL(normalizedUrl);
        } catch {
          toast.error("URL invalide");
          return;
        }
      }
      setSources((prev) => [...prev.filter(Boolean), normalizedUrl]);
      setNewSourceUrl("");
    }
  };

  const removeSource = (index: number) => {
    setSources((prev) => prev.filter((_, i) => i !== index));
  };

  const loadSuggestedSources = () => {
    if (theme) {
      setSources(theme.suggestedSources);
    }
  };

  const handleCrawlAllSources = async () => {
    const validSources = sources.filter(Boolean);
    if (validSources.length === 0) {
      toast.error("Ajoutez au moins une source");
      return;
    }

    if (!hasFirecrawlKey && !localStorage.getItem("firecrawl_api_key")) {
      setShowApiKeyModal(true);
      return;
    }

    if (!selectedTheme || !theme) return;

    setLoading(true);
    const namespace = selectedTheme;

    const initialSourceResults: SourceResult[] = validSources.map((s: string) => ({
      label: s.startsWith("geocity://")
        ? "geocity.ch API"
        : s.startsWith("pdf://")
        ? `PDFs ${(() => { try { return new URL("https://" + s.replace("pdf://", "")).hostname; } catch { return s; } })()}`
        : (() => { try { return new URL(s).hostname; } catch { return s; } })(),
      count: 0,
      done: false,
    }));

    setCrawlProgress({
      status: "Initialisation...",
      pagesFound: 0,
      pagesScraped: 0,
      sourcesTotal: validSources.length,
      sourcesDone: 0,
      sourceResults: initialSourceResults,
    });

    const firecrawlKey = localStorage.getItem("firecrawl_api_key");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (firecrawlKey) headers["X-Firecrawl-API-Key"] = firecrawlKey;

    let totalPagesCrawled = 0;

    for (let i = 0; i < validSources.length; i++) {
      const sourceUrl = validSources[i];
      const isGeocity = sourceUrl.startsWith("geocity://");
      const isPdf = sourceUrl.startsWith("pdf://");

      setCrawlProgress({
        status: isGeocity
          ? `Import API geocity.ch (source ${i + 1}/${validSources.length})...`
          : isPdf
          ? `Extraction PDFs (source ${i + 1}/${validSources.length})...`
          : `Crawling source ${i + 1}/${validSources.length}...`,
        pagesFound: 0,
        pagesScraped: totalPagesCrawled,
        currentSource: isGeocity ? "API geocity.ch - Agenda Yverdon" : isPdf ? `PDFs: ${sourceUrl.replace("pdf://", "")}` : sourceUrl,
        sourcesTotal: validSources.length,
        sourcesDone: i,
        sourceResults: [...initialSourceResults],
      });

      try {
        let response;

        if (isGeocity) {
          // Use dedicated geocity API route
          response = await fetch("/api/firestarter/geocity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              namespace: namespace,
              existingNamespace: i > 0 ? namespace : undefined,
            }),
          });
        } else if (isPdf) {
          // Use dedicated PDF extraction route
          const realUrl = "https://" + sourceUrl.replace("pdf://", "");
          response = await fetch("/api/firestarter/pdf", {
            method: "POST",
            headers,
            body: JSON.stringify({
              url: realUrl,
              namespace: namespace,
              existingNamespace: i > 0 ? namespace : undefined,
            }),
          });
        } else {
          // Use standard Firecrawl crawl
          response = await fetch("/api/firestarter/create", {
            method: "POST",
            headers,
            body: JSON.stringify({
              url: sourceUrl,
              limit: pageLimit,
              existingNamespace: i > 0 ? namespace : undefined,
              themeLabel: theme.label,
            }),
          });
        }

        const data = await response.json();

        if (data.success) {
          const sourceCount = data.details?.eventsIndexed || data.details?.pdfsIndexed || data.details?.pagesCrawled || 0;
          totalPagesCrawled += sourceCount;

          // Update per-source results
          initialSourceResults[i] = { ...initialSourceResults[i], count: sourceCount, done: true };

          // Save index on first source with initial sources[]
          if (i === 0) {
            const initialSources = validSources.map((s: string) => ({
              url: s,
              type: s.startsWith("geocity://") ? "geocity" as const : s.startsWith("pdf://") ? "pdf" as const : "firecrawl" as const,
              lastCrawledAt: "",
              documentCount: 0,
            }));
            await saveIndex({
              url: isGeocity ? "geocity.ch API" : sourceUrl,
              namespace: data.namespace || namespace,
              pagesCrawled: data.details?.eventsIndexed || data.details?.pagesCrawled || 0,
              createdAt: new Date().toISOString(),
              metadata: {
                title: theme.label,
                description: `${theme.description} - ${validSources.length} sources`,
              },
              sources: initialSources,
              lastCrawledAt: new Date().toISOString(),
            });
          }

          setCrawlProgress({
            status: `Source ${i + 1}/${validSources.length} terminée`,
            pagesFound: totalPagesCrawled,
            pagesScraped: totalPagesCrawled,
            sourcesTotal: validSources.length,
            sourcesDone: i + 1,
            sourceResults: [...initialSourceResults],
          });
        } else {
          toast.error(`Erreur sur ${isGeocity ? "geocity.ch" : isPdf ? "extraction PDF" : sourceUrl}: ${data.error || "Erreur inconnue"}`);
        }
      } catch {
        toast.error(`Erreur lors du ${isGeocity ? "import geocity.ch" : isPdf ? "extraction PDF" : `crawl de ${sourceUrl}`}`);
      }
    }

    setCrawlProgress({
      status: "Terminé !",
      pagesFound: totalPagesCrawled,
      pagesScraped: totalPagesCrawled,
      sourcesTotal: validSources.length,
      sourcesDone: validSources.length,
      sourceResults: [...initialSourceResults],
    });

    setTimeout(() => {
      router.push(`/dashboard?namespace=${namespace}`);
    }, 1500);
  };

  const handleApiKeySubmit = async () => {
    if (!firecrawlApiKey.trim()) {
      toast.error("Entrez une clé API Firecrawl valide");
      return;
    }
    setIsValidatingApiKey(true);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Firecrawl-API-Key": firecrawlApiKey,
        },
        body: JSON.stringify({ url: "https://example.com" }),
      });
      if (!response.ok) throw new Error("Invalid key");
      localStorage.setItem("firecrawl_api_key", firecrawlApiKey);
      setHasFirecrawlKey(true);
      toast.success("Clé API enregistrée !");
      setShowApiKeyModal(false);
    } catch {
      toast.error("Clé API invalide.");
    } finally {
      setIsValidatingApiKey(false);
    }
  };

  if (isCreationDisabled === undefined) {
    return (
      <div className="min-h-screen bg-[#FBFAF9] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBFAF9]">
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-5xl mx-auto font-inter">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-2xl font-bold text-[#36322F]">Agenda Nord Vaudois</h1>
            <p className="text-sm text-gray-500 mt-1">Outil de veille pour journalistes</p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/indexes">
                <Newspaper className="w-4 h-4 mr-2" />
                Mes agendas
              </Link>
            </Button>
          </div>
        </div>

        {/* Titre principal */}
        <div className="text-center mb-12">
          <h2 className="text-4xl lg:text-5xl font-bold text-[#36322F] tracking-tight leading-tight">
            Créer un agenda
            <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-600 via-blue-500 to-indigo-600">
              pour le Nord Vaudois
            </span>
          </h2>
          <p className="mt-4 text-gray-600 max-w-xl mx-auto">
            Crawlez vos sources, laissez l&apos;IA extraire et structurer les événements.
            Posez des questions en langage naturel pour générer vos newsletters.
          </p>
        </div>

        {/* Sélection du thème */}
        {!selectedTheme ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {AGENDA_THEMES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTheme(t.id);
                    setSources([]);
                  }}
                  className={`group relative ${t.bgColor} ${t.borderColor} border-2 rounded-2xl p-8 text-left transition-all hover:shadow-lg hover:scale-[1.02] active:scale-[0.99]`}
                >
                  <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${t.color} flex items-center justify-center mb-4`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-[#36322F] mb-2">{t.label}</h3>
                  <p className="text-gray-600 text-sm">{t.description}</p>
                  <ArrowRight className="absolute top-8 right-8 w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </button>
              );
            })}
          </div>
        ) : (
          /* Configuration des sources */
          <div className="max-w-3xl mx-auto">
            {/* Thème sélectionné */}
            <div className="flex items-center gap-4 mb-8">
              <button
                onClick={() => {
                  setSelectedTheme(null);
                  setSources([""]);
                  setCrawlProgress(null);
                  setLoading(false);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                &larr; Retour
              </button>
              {theme && (
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${theme.color} flex items-center justify-center`}>
                    <theme.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-[#36322F]">{theme.label}</h3>
                    <p className="text-xs text-gray-500">Namespace: {selectedTheme}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Sources */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-[#36322F]">
                  <Calendar className="w-5 h-5 inline mr-2" />
                  Sources à crawler
                </h3>
                {theme && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadSuggestedSources}
                    disabled={loading}
                  >
                    Charger les suggestions
                  </Button>
                )}
              </div>

              <div className="space-y-3 mb-4">
                {sources.filter(Boolean).map((source, index) => {
                  const isGeocity = source.startsWith("geocity://");
                  const isPdf = source.startsWith("pdf://");
                  return (
                    <div
                      key={index}
                      className={`flex items-center gap-2 rounded-lg p-3 border ${isGeocity ? "bg-green-50 border-green-200" : isPdf ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"}`}
                    >
                      {isGeocity ? (
                        <Calendar className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : isPdf ? (
                        <FileText className="w-4 h-4 text-red-600 flex-shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      )}
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {isGeocity ? "Agenda Yverdon (geocity.ch API - 197 événements)" : isPdf ? `PDFs: ${source.replace("pdf://", "")}` : source}
                      </span>
                      {isGeocity && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">API directe</span>
                      )}
                      {isPdf && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">PDF extraction</span>
                      )}
                      <button
                        onClick={() => removeSource(index)}
                        disabled={loading}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSource();
                    }
                  }}
                  placeholder="https://www.exemple.ch/evenements"
                  className="flex-1"
                  disabled={loading}
                />
                <Button
                  type="button"
                  onClick={addSource}
                  variant="outline"
                  disabled={loading || !newSourceUrl.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Paramètres de crawl */}
            <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
              <h3 className="text-sm font-semibold text-[#36322F] mb-3">Pages par source</h3>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={config.crawling.minLimit}
                  max={config.crawling.maxLimit}
                  step="5"
                  value={pageLimit}
                  onChange={(e) => setPageLimit(parseInt(e.target.value))}
                  className="flex-1 accent-indigo-500"
                  disabled={loading}
                />
                <span className="text-[#36322F] font-bold w-12 text-right">{pageLimit}</span>
              </div>
              <div className="flex gap-2 mt-3">
                {config.crawling.limitOptions.map((limit) => (
                  <Button
                    key={limit}
                    type="button"
                    onClick={() => setPageLimit(limit)}
                    disabled={loading}
                    variant={pageLimit === limit ? "default" : "outline"}
                    size="sm"
                    className={pageLimit === limit ? "bg-indigo-600 hover:bg-indigo-700" : ""}
                  >
                    {limit}
                  </Button>
                ))}
              </div>
            </div>

            {/* Progression */}
            {crawlProgress && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-2 mb-4">
                  {crawlProgress.status === "Terminé !" ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : crawlProgress.status.includes("Erreur") ? (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  ) : (
                    <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                  )}
                  <span className="font-semibold text-[#36322F]">{crawlProgress.status}</span>
                </div>

                {crawlProgress.sourcesTotal && (
                  <div className="mb-3">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Sources traitées</span>
                      <span>{crawlProgress.sourcesDone}/{crawlProgress.sourcesTotal}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-purple-600 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${((crawlProgress.sourcesDone || 0) / crawlProgress.sourcesTotal) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Per-source results */}
                {crawlProgress.sourceResults && crawlProgress.sourceResults.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {crawlProgress.sourceResults.map((sr, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                          sr.done
                            ? "bg-green-50 border border-green-100"
                            : crawlProgress.sourcesDone === idx
                            ? "bg-indigo-50 border border-indigo-100"
                            : "bg-gray-50 border border-gray-100"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {sr.done ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                          ) : crawlProgress.sourcesDone === idx ? (
                            <Loader2 className="w-4 h-4 text-indigo-500 animate-spin flex-shrink-0" />
                          ) : (
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                          )}
                          <span className="truncate text-gray-700">{sr.label}</span>
                        </div>
                        {sr.done ? (
                          <span className="font-semibold text-green-700 ml-2 flex-shrink-0">
                            {sr.count} doc{sr.count > 1 ? "s" : ""}
                          </span>
                        ) : crawlProgress.sourcesDone === idx ? (
                          <span className="text-indigo-500 ml-2 flex-shrink-0">en cours...</span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                {crawlProgress.currentSource && !crawlProgress.sourceResults && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 mb-1">Source en cours :</p>
                    <p className="text-sm text-gray-700 truncate">{crawlProgress.currentSource}</p>
                  </div>
                )}

                <div className="flex justify-between text-sm text-gray-600 mt-3 pt-3 border-t border-gray-100">
                  <span>Total documents indexés</span>
                  <span className="font-bold text-[#36322F]">{crawlProgress.pagesScraped}</span>
                </div>
              </div>
            )}

            {/* Bouton lancer */}
            <Button
              onClick={handleCrawlAllSources}
              disabled={loading || sources.filter(Boolean).length === 0}
              className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Crawling en cours...
                </>
              ) : (
                <>
                  Lancer le crawl ({sources.filter(Boolean).length} source{sources.filter(Boolean).length > 1 ? "s" : ""})
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </div>
        )}

        {/* Features */}
        {!selectedTheme && (
          <div className="mt-16 max-w-3xl mx-auto">
            <h3 className="text-center text-sm font-semibold text-gray-400 uppercase tracking-wider mb-6">
              Comment ça marche
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl font-bold text-purple-600">1</span>
                </div>
                <h4 className="font-semibold text-[#36322F] mb-1">Ajoutez vos sources</h4>
                <p className="text-sm text-gray-500">Sites web d&apos;événements, communes, salles de spectacle</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl font-bold text-blue-600">2</span>
                </div>
                <h4 className="font-semibold text-[#36322F] mb-1">L&apos;IA crawle et indexe</h4>
                <p className="text-sm text-gray-500">Firecrawl extrait le contenu, l&apos;IA le structure</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl font-bold text-indigo-600">3</span>
                </div>
                <h4 className="font-semibold text-[#36322F] mb-1">Interrogez l&apos;agenda</h4>
                <p className="text-sm text-gray-500">&quot;Quels événements ce week-end ?&quot; et obtenez un agenda structuré</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* API Key Modal */}
      <Dialog open={showApiKeyModal} onOpenChange={setShowApiKeyModal}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-900">
          <DialogHeader>
            <DialogTitle>Clé API Firecrawl requise</DialogTitle>
            <DialogDescription>
              Cet outil nécessite une clé API Firecrawl pour crawler les sites web.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <Button
              onClick={() => window.open("https://www.firecrawl.dev", "_blank")}
              variant="outline"
              size="sm"
              className="flex items-center justify-center gap-2 cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              Obtenir une clé Firecrawl
            </Button>
            <div className="flex flex-col gap-2">
              <label htmlFor="firecrawl-key" className="text-sm font-medium">
                Clé API Firecrawl
              </label>
              <Input
                id="firecrawl-key"
                type="password"
                placeholder="fc-..."
                value={firecrawlApiKey}
                onChange={(e) => setFirecrawlApiKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isValidatingApiKey) handleApiKeySubmit();
                }}
                disabled={isValidatingApiKey}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowApiKeyModal(false)}
              disabled={isValidatingApiKey}
            >
              Annuler
            </Button>
            <Button
              onClick={handleApiKeySubmit}
              disabled={isValidatingApiKey || !firecrawlApiKey.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isValidatingApiKey ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validation...
                </>
              ) : (
                "Valider"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
