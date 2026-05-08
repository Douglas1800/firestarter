CREATE TYPE "public"."categorie" AS ENUM('culture', 'sport', 'politique', 'marche', 'autre');--> statement-breakpoint
CREATE TYPE "public"."crawl_status" AS ENUM('ok', 'error', 'empty');--> statement-breakpoint
CREATE TYPE "public"."recurrence" AS ENUM('aucune', 'quotidienne', 'hebdo', 'mensuelle', 'annuelle', 'custom');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('site_agenda', 'site_actu', 'fb_page', 'fb_group', 'ical', 'rss', 'geocity');--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"source_url" text,
	"nom" text NOT NULL,
	"description_courte" text,
	"description_longue" text,
	"photo_url" text,
	"date_debut" date NOT NULL,
	"heure_debut" time,
	"date_fin" date,
	"heure_fin" time,
	"lieu_nom" text,
	"adresse" text,
	"lat" double precision,
	"lng" double precision,
	"categorie" "categorie" DEFAULT 'autre' NOT NULL,
	"recurrence" "recurrence" DEFAULT 'aucune' NOT NULL,
	"prix" text,
	"popularite" integer DEFAULT 0 NOT NULL,
	"score_qualite" integer DEFAULT 0 NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"crawled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uniq_event_intra_source" UNIQUE("source_id","date_debut","nom")
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"adresse_normalized" text PRIMARY KEY NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commune" text NOT NULL,
	"code_ofs" integer,
	"type" "source_type" NOT NULL,
	"url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"commune_lat" double precision,
	"commune_lng" double precision,
	"extraction_strategy" text,
	"last_crawl_at" timestamp with time zone,
	"last_crawl_status" "crawl_status",
	"last_crawl_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_url_unique" UNIQUE("url")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_events_date_visible" ON "events" USING btree ("date_debut") WHERE hidden = false;--> statement-breakpoint
CREATE INDEX "idx_events_source" ON "events" USING btree ("source_id");