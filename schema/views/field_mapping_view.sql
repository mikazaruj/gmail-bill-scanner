CREATE OR REPLACE VIEW public.field_mapping_view AS
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
FROM user_field_mappings ufm
  JOIN field_definitions fd ON ufm.field_id = fd.id
ORDER BY ufm.display_order; 