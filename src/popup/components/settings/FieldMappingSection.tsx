import React, { useState, useEffect, useRef } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { FieldMapping, updateFieldMapping, getFieldDefinitions, FieldDefinition, createFieldMapping } from '../../../services/fieldMapping';

interface FieldMappingSectionProps {
  userId: string | null;
  fieldMappings: FieldMapping[];
  isLoading: boolean;
  onRefresh: () => void;
}

const FieldMappingSection = ({
  userId,
  fieldMappings,
  isLoading,
  onRefresh
}: FieldMappingSectionProps) => {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [draggedItem, setDraggedItem] = useState<FieldMapping | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [availableFields, setAvailableFields] = useState<FieldMapping[]>([]);
  const [showAvailableFields, setShowAvailableFields] = useState(false);
  const [allFieldDefinitions, setAllFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [unmappedFields, setUnmappedFields] = useState<FieldDefinition[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [pendingCreation, setPendingCreation] = useState<{ fieldId: string, column: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState<string | null>(null);
  
  // Ref for the active fields container
  const activeFieldsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMappings(fieldMappings);
    
    // Find disabled/available fields
    const disabled = fieldMappings.filter(m => !m.is_enabled);
    setAvailableFields(disabled);
    
    // Load all field definitions to find unmapped fields
    if (userId) {
      loadFieldDefinitions();
    }
  }, [fieldMappings, userId]);

  const loadFieldDefinitions = async () => {
    if (isLoadingFields) return;
    
    setIsLoadingFields(true);
    try {
      const definitions = await getFieldDefinitions();
      setAllFieldDefinitions(definitions);
      
      // Find fields that aren't mapped at all
      const mappedFieldIds = new Set(fieldMappings.map(m => m.field_id));
      const notMappedAtAll = definitions.filter(def => !mappedFieldIds.has(def.id));
      setUnmappedFields(notMappedAtAll);
    } catch (error) {
      console.error('Error loading field definitions:', error);
    } finally {
      setIsLoadingFields(false);
    }
  };

  const handleDragStart = (mapping: FieldMapping | { field_id: string, display_name: string, is_unmapped?: boolean }) => {
    console.log('Drag started:', mapping);
    if ('is_unmapped' in mapping) {
      // Create a temporary mapping for the unmapped field to use during drag
      const tempMapping: any = {
        field_id: mapping.field_id,
        display_name: mapping.display_name,
        is_unmapped: true,
        mapping_id: `temp-${mapping.field_id}`,
        is_enabled: false,
        column_mapping: '',
      };
      setDraggedItem(tempMapping);
    } else {
      setDraggedItem(mapping as FieldMapping);
    }
  };

  // Handle dragging over the active fields container
  const handleDragOverActiveFields = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggedItem || !userId || isUpdating) return;
    
    // Only highlight if we're dragging from available fields
    if (!draggedItem.is_enabled || 'is_unmapped' in draggedItem) {
      setIsDraggingOver('active');
    }
  };

  const handleDragLeaveActiveFields = () => {
    setIsDraggingOver(null);
  };

  // Handle dropping on the active fields container
  const handleDropOnActiveFields = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    console.log('Drop on active fields:', draggedItem);
    setIsDraggingOver(null);
    
    if (!draggedItem || !userId || isUpdating) return;
    
    // Only process if we're dragging from available fields
    if (draggedItem.is_enabled && !('is_unmapped' in draggedItem)) {
      return;
    }
    
    setIsUpdating(true);
    
    try {
      // Find next available column letter
      const usedColumns = new Set(mappings.filter(m => m.is_enabled).map(m => m.column_mapping));
      let columnLetter = '';
      for (let i = 65; i <= 90; i++) { // A-Z
        const letter = String.fromCharCode(i);
        if (!usedColumns.has(letter)) {
          columnLetter = letter;
          break;
        }
      }
      
      if (!columnLetter) {
        console.error('No available column letters');
        setIsUpdating(false);
        return;
      }
      
      // Find next display order
      const nextOrder = mappings.filter(m => m.is_enabled).length > 0 
        ? Math.max(...mappings.filter(m => m.is_enabled).map(m => m.display_order)) + 1 
        : 1;

      if ('is_unmapped' in draggedItem) {
        // Create new field mapping
        const success = await createFieldMapping(
          userId,
          draggedItem.field_id,
          columnLetter,
          nextOrder,
          true
        );
        
        if (success) {
          console.log('Created new field mapping');
          // Remove from unmapped fields
          setUnmappedFields(prev => prev.filter(f => f.id !== draggedItem.field_id));
          // Refresh all mappings
          onRefresh();
        }
      } else {
        // Enable existing field mapping
        const success = await updateFieldMapping(userId, draggedItem.field_id, {
          is_enabled: true,
          column_mapping: columnLetter,
          display_order: nextOrder
        });
        
        if (success) {
          console.log('Enabled existing field mapping');
          // Remove from available fields
          setAvailableFields(prev => prev.filter(f => f.mapping_id !== draggedItem.mapping_id));
          // Refresh all mappings
          onRefresh();
        }
      }
    } catch (error) {
      console.error('Error adding field to active section:', error);
    } finally {
      setIsUpdating(false);
      setDraggedItem(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, targetColumn: string) => {
    e.preventDefault();
    if (!draggedItem || !userId || isUpdating) return;
    
    // Allow the drag if it's a different column or a new field
    if (draggedItem.column_mapping === targetColumn && !('is_unmapped' in draggedItem)) {
      return;
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>, targetColumn: string) => {
    e.preventDefault();
    if (!draggedItem || !userId || isUpdating) return;
    
    // If this is the same column as the field is already in, ignore
    if (draggedItem.column_mapping === targetColumn && !('is_unmapped' in draggedItem)) {
      setDraggedItem(null);
      return;
    }
    
    setIsUpdating(true);

    // Handle unmapped field being dropped directly
    if ('is_unmapped' in draggedItem) {
      setPendingCreation({ fieldId: draggedItem.field_id, column: targetColumn });
      
      try {
        // First check if there's already a field with this column
        const existingField = mappings.find(
          m => m.column_mapping === targetColumn && m.is_enabled
        );
        
        // If there is, we need to disable it first or assign it a temporary column
        if (existingField) {
          // First assign it a temporary unused column
          const usedColumns = new Set(mappings.filter(m => m.is_enabled).map(m => m.column_mapping));
          let tempColumn = '';
          for (let i = 65; i <= 90; i++) { // A-Z
            const letter = String.fromCharCode(i);
            if (!usedColumns.has(letter)) {
              tempColumn = letter;
              break;
            }
          }
          
          if (tempColumn) {
            await updateFieldMapping(userId, existingField.field_id, {
              column_mapping: tempColumn
            });
          } else {
            // If no column available, disable it
            await updateFieldMapping(userId, existingField.field_id, {
              is_enabled: false
            });
          }
        }
        
        // Now create the new field mapping
        const nextOrder = mappings.filter(m => m.is_enabled).length > 0 
          ? Math.max(...mappings.filter(m => m.is_enabled).map(m => m.display_order)) + 1 
          : 1;
        
        const success = await createFieldMapping(
          userId,
          draggedItem.field_id,
          targetColumn,
          nextOrder,
          true
        );
        
        if (success) {
          // Remove from unmapped fields
          setUnmappedFields(prev => prev.filter(f => f.id !== draggedItem.field_id));
          // Refresh all mappings
          onRefresh();
        }
      } catch (error) {
        console.error('Error adding new field:', error);
      } finally {
        setPendingCreation(null);
        setIsUpdating(false);
      }
      
      setDraggedItem(null);
      return;
    }

    // Update the mappings state first (for immediate UI feedback)
    setMappings(prev => {
      const newMappings = [...prev];
      const draggedMapping = newMappings.find(m => m.mapping_id === draggedItem.mapping_id);
      
      if (!draggedMapping) return prev;
      
      // Find the mapping that currently has the target column
      const targetMapping = newMappings.find(
        m => m.column_mapping === targetColumn && m.mapping_id !== draggedItem.mapping_id && m.is_enabled
      );
      
      // If there's a field already using this column, swap them
      if (targetMapping) {
        // Swap column mappings
        const tempColumn = draggedMapping.column_mapping;
        draggedMapping.column_mapping = targetMapping.column_mapping;
        targetMapping.column_mapping = tempColumn;
      } else {
        // Just update the dragged item's column
        draggedMapping.column_mapping = targetColumn;
      }

      // If we're dragging from available fields, enable it
      if (!draggedMapping.is_enabled) {
        draggedMapping.is_enabled = true;
        
        // Update available fields
        setAvailableFields(prev => prev.filter(f => f.mapping_id !== draggedMapping?.mapping_id));
      }
      
      return newMappings;
    });
    
    setHasChanges(true);

    // Immediately save changes to database
    try {
      const draggedMapping = mappings.find(m => m.mapping_id === draggedItem.mapping_id);
      if (!draggedMapping) {
        setIsUpdating(false);
        return;
      }
      
      // Find if any mapping is currently using this target column
      const targetMapping = mappings.find(
        m => m.column_mapping === targetColumn && m.mapping_id !== draggedItem.mapping_id && m.is_enabled
      );
      
      // If we're swapping columns, we need to update both fields
      // but to avoid constraint issues, use a temporary column for one of them first
      if (targetMapping) {
        // Generate a temporary column that's not in use
        const usedColumns = new Set(mappings.filter(m => m.is_enabled).map(m => m.column_mapping));
        let tempColumn = '';
        for (let i = 65; i <= 90; i++) { // A-Z
          const letter = String.fromCharCode(i);
          if (!usedColumns.has(letter) && letter !== targetColumn && letter !== draggedMapping.column_mapping) {
            tempColumn = letter;
            break;
          }
        }
        
        if (!tempColumn) {
          // If no available column, use a special prefix to avoid conflicts
          tempColumn = 'TEMP_' + Date.now();
        }
        
        // First move target mapping to temporary column
        await updateFieldMapping(userId, targetMapping.field_id, {
          column_mapping: tempColumn
        });
        
        // Then update the dragged item to the target column
        await updateFieldMapping(userId, draggedMapping.field_id, {
          column_mapping: targetColumn,
          is_enabled: true
        });
        
        // Finally move the target mapping to the dragged item's original column
        await updateFieldMapping(userId, targetMapping.field_id, {
          column_mapping: draggedMapping.column_mapping
        });
      } else {
        // No swapping needed, just update the dragged item
        await updateFieldMapping(userId, draggedMapping.field_id, {
          column_mapping: targetColumn,
          is_enabled: true
        });
      }
      
      // Refresh all mappings to ensure everything is in sync
      onRefresh();
      setHasChanges(false);
    } catch (error) {
      console.error('Error updating field mapping:', error);
    } finally {
      setIsUpdating(false);
      setDraggedItem(null);
    }
  };

  // Add reordering functionality directly in the current view
  const handleDragOverForReordering = (e: React.DragEvent<HTMLDivElement>, overMapping: FieldMapping) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.mapping_id === overMapping.mapping_id || !userId || isUpdating) return;

    // Only allow reordering if both items are enabled
    if (!draggedItem.is_enabled || !overMapping.is_enabled) return;

    // Reorder the mappings
    setMappings(prev => {
      const newMappings = [...prev];
      const draggedIndex = newMappings.findIndex(m => m.mapping_id === draggedItem.mapping_id);
      const overIndex = newMappings.findIndex(m => m.mapping_id === overMapping.mapping_id);
      
      if (draggedIndex === -1 || overIndex === -1) return prev;
      
      // Remove the dragged item
      const [removed] = newMappings.splice(draggedIndex, 1);
      // Insert at the new position
      newMappings.splice(overIndex, 0, removed);
      
      // Update display_order for all enabled items
      const enabledMappings = newMappings.filter(m => m.is_enabled);
      enabledMappings.forEach((mapping, index) => {
        mapping.display_order = index + 1;
      });
      
      return newMappings;
    });
    
    setHasChanges(true);
  };

  const handleDragEnd = () => {
    console.log('Drag ended');
    setDraggedItem(null);
    setIsDraggingOver(null);
    
    // If there are changes, save them
    if (hasChanges && userId) {
      saveChanges();
    }
  };

  const saveChanges = async () => {
    if (!userId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      // Save all display orders
      const enabledMappings = mappings.filter(m => m.is_enabled);
      
      for (const mapping of enabledMappings) {
        await updateFieldMapping(userId, mapping.field_id, {
          display_order: mapping.display_order
        });
      }
      
      onRefresh();
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving field mapping changes:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDisableField = async (mapping: FieldMapping) => {
    if (!userId || isUpdating) return;
    
    setIsUpdating(true);
    try {
      // Update locally first
      setMappings(prev => prev.map(m => 
        m.mapping_id === mapping.mapping_id 
          ? { ...m, is_enabled: false } 
          : m
      ));
      
      // Add to available fields
      setAvailableFields(prev => [...prev, { ...mapping, is_enabled: false }]);
      
      // Update in the database
      await updateFieldMapping(userId, mapping.field_id, {
        is_enabled: false
      });
      
      onRefresh();
    } catch (error) {
      console.error('Error disabling field:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddNewField = async (fieldDef: FieldDefinition) => {
    if (!userId || isUpdating) return;
    
    setIsLoadingFields(true);
    setIsUpdating(true);
    try {
      // Find next available column letter
      const usedColumns = new Set(mappings.filter(m => m.is_enabled).map(m => m.column_mapping));
      let columnLetter = '';
      for (let i = 65; i <= 90; i++) { // A-Z
        const letter = String.fromCharCode(i);
        if (!usedColumns.has(letter)) {
          columnLetter = letter;
          break;
        }
      }
      
      // Find next display order
      const nextOrder = mappings.filter(m => m.is_enabled).length > 0 
        ? Math.max(...mappings.filter(m => m.is_enabled).map(m => m.display_order)) + 1 
        : 1;
      
      // Create the field mapping
      const success = await createFieldMapping(
        userId,
        fieldDef.id,
        columnLetter,
        nextOrder,
        true
      );
      
      if (success) {
        // Remove from unmapped fields
        setUnmappedFields(prev => prev.filter(f => f.id !== fieldDef.id));
        // Refresh all mappings
        onRefresh();
      }
    } catch (error) {
      console.error('Error adding new field:', error);
    } finally {
      setIsLoadingFields(false);
      setIsUpdating(false);
    }
  };

  // Generate a fixed array of column letters (A-Z)
  const columnLetters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

  // Only show used columns and the first empty column
  const usedColumns = new Set(
    mappings.filter(m => m.is_enabled).map(m => m.column_mapping)
  );
  
  // Get enabled mappings sorted by display order
  const enabledMappings = [...mappings.filter(m => m.is_enabled)]
    .sort((a, b) => a.display_order - b.display_order);

  // Toggle showing available fields
  const toggleAvailableFields = () => {
    setShowAvailableFields(!showAvailableFields);
  };

  // Render a field card to match the mockup
  const renderFieldCard = (fieldMapping: FieldMapping) => {
    return (
      <div 
        key={fieldMapping.mapping_id}
        className="bg-white border border-gray-200 rounded-lg shadow-sm mb-1.5"
        draggable={!isUpdating && Boolean(userId)}
        onDragStart={() => handleDragStart(fieldMapping)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOverForReordering(e, fieldMapping)}
      >
        <div className="flex items-center justify-between py-2 px-3">
          <div className="flex items-center">
            <div className="w-6 h-6 flex-shrink-0 rounded-md bg-gray-50 flex items-center justify-center mr-2 text-gray-700 font-medium border border-gray-200 text-sm">
              {fieldMapping.column_mapping}
            </div>
            <div className="mr-2 text-gray-300 text-xs">⠿⠿</div>
            <span className="text-gray-900 font-medium text-sm">{fieldMapping.display_name}</span>
          </div>
          <button 
            className="text-gray-400 hover:text-gray-600 p-0.5 rounded-full"
            onClick={() => handleDisableField(fieldMapping)}
            title="Remove field"
            disabled={isUpdating}
          >
            ×
          </button>
        </div>
      </div>
    );
  };

  // Render an available field item
  const renderAvailableField = (field: any) => {
    const isUnmapped = 'id' in field; // Check if this is a field definition vs mapped field
    const fieldId = isUnmapped ? field.id : field.field_id;
    const displayName = isUnmapped ? field.display_name : field.display_name;
    
    return (
      <div 
        key={isUnmapped ? field.id : field.mapping_id}
        className="bg-white border border-gray-200 rounded-lg py-1.5 px-3 mb-1.5 flex items-center cursor-move"
        draggable={!isUpdating && Boolean(userId)}
        onDragStart={() => handleDragStart(
          isUnmapped ? { 
            field_id: field.id, 
            display_name: field.display_name,
            is_unmapped: true 
          } : field
        )}
        onDragEnd={handleDragEnd}
        onClick={() => isUnmapped ? handleAddNewField(field) : null}
      >
        <div className="text-blue-500 mr-2 text-sm">⊕</div>
        <span className="text-gray-700 text-sm">{displayName}</span>
      </div>
    );
  };

  return (
    <CollapsibleSection title="Field Mapping" defaultOpen={true}>
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading field mappings...</div>
      ) : (
        <>
          <div className="mb-1">
            <div className="text-xs text-gray-500 mb-2">
              Drag fields to reorder or remove from your sheet
            </div>
            
            <div className="relative">
              {isUpdating && (
                <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10 rounded-lg">
                  <div className="text-sm text-gray-600">Updating...</div>
                </div>
              )}
              
              {/* Enabled fields section - always visible and draggable */}
              <div 
                ref={activeFieldsRef}
                className={`mb-2 p-0.5 rounded-lg ${isDraggingOver === 'active' ? 'bg-blue-50 border-2 border-dashed border-blue-300' : ''}`}
                onDragOver={handleDragOverActiveFields}
                onDragLeave={handleDragLeaveActiveFields}
                onDrop={handleDropOnActiveFields}
              >
                {enabledMappings.length > 0 ? (
                  <div>
                    {enabledMappings.map(mapping => renderFieldCard(mapping))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 py-3 text-center italic">
                    No fields configured yet. Drag fields here from below.
                  </div>
                )}
              </div>

              {/* Add More Fields button */}
              <button 
                onClick={toggleAvailableFields}
                className="w-full py-2 rounded-lg bg-blue-50 text-blue-600 mb-2 flex items-center justify-center text-sm"
              >
                <span className="mr-1 text-blue-500">{showAvailableFields ? "▲" : "▼"}</span>
                {showAvailableFields ? "Hide Available Fields" : "Add More Fields"}
              </button>
              
              {/* Available Fields section */}
              {showAvailableFields && (
                <div>
                  <div className="text-xs font-medium text-gray-700 mb-1.5">Available Fields</div>
                  <div className="max-h-48 overflow-y-auto">
                    {/* Combine both types of available fields */}
                    {availableFields.length === 0 && unmappedFields.length === 0 && !isLoadingFields && (
                      <div className="text-center py-2 text-xs text-gray-500">
                        No available fields
                      </div>
                    )}
                    
                    {isLoadingFields && (
                      <div className="text-center py-2 text-xs text-gray-500">
                        Loading...
                      </div>
                    )}
                    
                    {/* Show disabled fields */}
                    {availableFields.map(field => renderAvailableField(field))}

                    {/* Show unmapped fields */}
                    {unmappedFields.map(field => renderAvailableField(field))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </CollapsibleSection>
  );
};

export default FieldMappingSection; 