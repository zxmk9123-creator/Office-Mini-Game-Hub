ALTER TABLE "game_results" ADD COLUMN "ranking_date" text;--> statement-breakpoint
CREATE INDEX "game_results_game_id_ranking_date_idx" ON "game_results" USING btree ("game_id","ranking_date");