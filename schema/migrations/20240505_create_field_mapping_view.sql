-- Recreate the field_mapping_view
DROP VIEW IF EXISTS public.field_mapping_view;
CREATE VIEW public.field_mapping_view AS
SELECT 
  ufm.user_id,
  ufm.id AS mapping_id,
  fd.id AS field_id,
  fd.name,
  fd.display_name,
  fd.field_type,
  ufm.column_mapping,
  ufm.display_order,
  ufm.is_enabled
FROM public.user_field_mappings ufm
  JOIN public.field_definitions fd ON ufm.field_id = fd.id
ORDER BY ufm.display_order; 