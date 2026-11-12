-- Jaguar v3.1: optional time for Due and Fixed start.
-- Run ONCE in phpMyAdmin on the Jaguar database BEFORE uploading the v3.1 PHP files.
-- Additive only: existing rows keep their dates; the new columns start empty (NULL = no time entered).
ALTER TABLE tasks
  ADD COLUMN due_time TIME NULL AFTER due_date,
  ADD COLUMN fixed_time TIME NULL AFTER fixed_start;
