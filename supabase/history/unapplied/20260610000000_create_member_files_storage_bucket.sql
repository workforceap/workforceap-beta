INSERT INTO storage.buckets (id, name, public)
SELECT 'member-files', 'member-files', false
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'member-files');
