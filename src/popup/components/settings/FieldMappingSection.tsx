import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    setMappings(fieldMappings);
    
    // Find disabled/available fields
    const disabled = fieldMappings.filter(m => !m.is_enabled);
    setAvailableFields(disabled);
    
    // If there are disabled fields, automatically show them
    if (disabled.length > 0) {
      setShowAvailableFields(true);
    }

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

  const handleDragEnd = () => {
    setDraggedItem(null);
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

  // Generate a fixed array of column letters (A-I)
  const columnLetters = Array.from({ length: 9 }, (_, i) => String.fromCharCode(65 + i));

  // Only show used columns and the first empty column
  const usedColumns = new Set(
    mappings.filter(m => m.is_enabled).map(m => m.column_mapping)
  );
  
  const columnsToShow = columnLetters.filter(col => 
    usedColumns.has(col)
  );

  return (
    <CollapsibleSection title="Field Mapping" defaultOpen={false}>
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading field mappings...</div>
      ) : (
        <>
          <div className="mb-1">
            <div className="text-xs text-gray-500 mb-1.5">
              Current mapping: {mappings.filter(m => m.is_enabled).length > 0 && 
                <span className="text-xs text-blue-500 ml-1">(drag fields to columns)</span>}
            </div>
            
            <div className="space-y-1.5 relative">
              {isUpdating && (
                <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10 rounded-lg">
                  <div className="text-sm text-gray-600">Updating...</div>
                </div>
              )}
              
              {columnLetters.map(colLetter => {
                const fieldInColumn = mappings.find(
                  m => m.is_enabled && m.column_mapping === colLetter
                );
                
                // Only show column if it has a field or is the first empty column after used columns
                if (!fieldInColumn) {
                  // Hide empty columns that aren't adjacent to used ones to avoid gaps
                  if (!columnsToShow.some(letter => 
                    letter.charCodeAt(0) === colLetter.charCodeAt(0) - 1)) {
                    return null;
                  }
                }

                // Check if this column is pending creation for a new field
                const isPending = pendingCreation?.column === colLetter;
                
                return fieldInColumn ? (
                  <div 
                    key={colLetter}
                    className={`bg-white p-1.5 rounded-lg border cursor-move ${
                      draggedItem?.mapping_id === fieldInColumn.mapping_id 
                        ? 'border-blue-400 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    } text-xs flex items-center`}
                    draggable={!isUpdating && Boolean(userId)}
                    onDragStart={() => handleDragStart(fieldInColumn)}
                    onDragOver={(e) => handleDragOver(e, colLetter)}
                    onDragEnd={handleDragEnd}
                    onDrop={(e) => handleDrop(e, colLetter)}
                  >
                    <div className="flex items-center flex-1">
                      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium text-sm">
                        {colLetter}
                      </div>
                      <span className="text-gray-900 font-medium">{fieldInColumn.display_name}</span>
                    </div>
                    <div className="flex items-center">
                      <button 
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full"
                        onClick={() => handleDisableField(fieldInColumn)}
                        title="Remove field"
                        disabled={isUpdating}
                      >
                        ×
                      </button>
                      <span className="text-gray-400 text-xs ml-1">≡</span>
                    </div>
                  </div>
                ) : (
                  <div 
                    key={colLetter}
                    className={`bg-white p-1.5 rounded-lg border border-dashed ${
                      isPending ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
                    } text-xs flex items-center`}
                    onDragOver={(e) => handleDragOver(e, colLetter)}
                    onDrop={(e) => handleDrop(e, colLetter)}
                  >
                    <div className="flex items-center flex-1">
                      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium text-sm">
                        {colLetter}
                      </div>
                      <span className="text-gray-400 italic">
                        {isPending ? 'Adding...' : 'Drop field here'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Combined Available Fields Section */}
            <div className="mt-3">
              <button 
                onClick={() => setShowAvailableFields(!showAvailableFields)}
                className="text-xs text-blue-500 flex items-center"
                disabled={isUpdating}
              >
                <span className="mr-1">{showAvailableFields ? '▼' : '►'}</span>
                Available fields ({availableFields.length + unmappedFields.length})
              </button>
              
              {showAvailableFields && (
                <div className="mt-1.5 max-h-48 overflow-y-auto space-y-1.5 bg-gray-50 p-1.5 rounded-lg">
                  {/* Show disabled fields first */}
                  {availableFields.map(field => (
                    <div 
                      key={field.mapping_id}
                      className={`bg-white p-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-xs flex items-center cursor-move ${
                        draggedItem?.mapping_id === field.mapping_id ? 'border-blue-400 bg-blue-50' : ''
                      }`}
                      draggable={!isUpdating && Boolean(userId)}
                      onDragStart={() => handleDragStart(field)}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-50 flex items-center justify-center mr-2 text-gray-400 font-medium text-sm border border-gray-200">
                        +
                      </div>
                      <span className="text-gray-600">{field.display_name}</span>
                      <span className="text-gray-400 text-xs ml-auto">≡</span>
                    </div>
                  ))}

                  {/* Show fields that aren't mapped at all */}
                  {unmappedFields.map(field => (
                    <div 
                      key={field.id}
                      className="bg-white p-1.5 rounded-lg border border-gray-200 hover:border-gray-300 text-xs flex items-center cursor-move"
                      draggable={!isUpdating && Boolean(userId)}
                      onDragStart={() => handleDragStart({ 
                        field_id: field.id, 
                        display_name: field.display_name,
                        is_unmapped: true 
                      })}
                      onDragEnd={handleDragEnd}
                    >
                      <div className="w-6 h-6 flex-shrink-0 rounded-full bg-gray-50 flex items-center justify-center mr-2 text-gray-400 font-medium text-sm border border-gray-200">
                        +
                      </div>
                      <span className="text-gray-600">{field.display_name}</span>
                      <span className="text-gray-400 text-xs ml-auto">≡</span>
                    </div>
                  ))}

                  {isLoadingFields && (
                    <div className="text-center py-1 text-xs text-gray-500">
                      Loading...
                    </div>
                  )}

                  {availableFields.length === 0 && unmappedFields.length === 0 && !isLoadingFields && (
                    <div className="text-center py-1 text-xs text-gray-500">
                      No available fields
                    </div>
                  )}
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