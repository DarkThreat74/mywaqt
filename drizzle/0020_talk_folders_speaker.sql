-- Add speaker column to talk_folders
-- Used as default speaker for talks in this folder (inherited when talk speaker is empty)
ALTER TABLE "talk_folders" ADD COLUMN "speaker" text;
