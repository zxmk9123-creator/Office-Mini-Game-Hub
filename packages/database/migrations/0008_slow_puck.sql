ALTER TABLE "sticky_notes" ADD COLUMN "player_id" uuid;--> statement-breakpoint
ALTER TABLE "sticky_notes" ADD CONSTRAINT "sticky_notes_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sticky_notes_player_id_idx" ON "sticky_notes" USING btree ("player_id");