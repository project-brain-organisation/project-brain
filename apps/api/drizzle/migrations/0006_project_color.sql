-- 0006_project_color.sql
-- Adds a color to project_meta so the project root node can be recolored in the
-- graph, mirroring thoughts.color (inline nullable varchar(7) hex, no colors table).
ALTER TABLE "project_meta" ADD COLUMN "color" varchar(7);
