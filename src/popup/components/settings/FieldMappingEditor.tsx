import React, { useState, useEffect } from 'react';
import { FieldMapping, updateFieldMapping, getFieldDefinitions, FieldDefinition, createFieldMapping } from '../../../services/fieldMapping';

interface FieldMappingEditorProps {
  userId: string;
  fieldMappings: FieldMapping[];
  onClose: () => void;
  onUpdate: () => void;
}

const FieldMappingEditor: React.FC<FieldMappingEditorProps> = ({
  userId,
  fieldMappings,
  onClose,
  onUpdate
}) => {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draggedItem, setDraggedItem] = useState<FieldMapping | null>(null);
  const [allFieldDefinitions, setAllFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>([]);

  useEffect(() => {
    setMappings([...fieldMappings]);
    
    // Load all field definitions to show disabled ones
    const loadFieldDefinitions = async () => {
      setIsLoadingFields(true);
      try {
        const definitions = await getFieldDefinitions();
        setAllFieldDefinitions(definitions);
        
        // Find fields that aren't mapped yet
        const mappedFieldIds = new Set(fieldMappings.map(m => m.field_id));
        const unmappedFields = definitions.filter(def => !mappedFieldIds.has(def.id));
        setAvailableFields(unmappedFields);
      } catch (error) {
        console.error('Error loading field definitions:', error);
      } finally {
        setIsLoadingFields(false);
      }
    };
    
    loadFieldDefinitions();
  }, [fieldMappings]);

  const handleColumnMappingChange = (mappingId: string, value: string) => {
    setMappings(prev => 
      prev.map(mapping => 
        mapping.mapping_id === mappingId 
          ? { ...mapping, column_mapping: value } 
          : mapping
      )
    );
  };

  const handleToggleEnabled = (mappingId: string) => {
    setMappings(prev => 
      prev.map(mapping => 
        mapping.mapping_id === mappingId 
          ? { ...mapping, is_enabled: !mapping.is_enabled } 
          : mapping
      )
    );
  };

  const handleAddField = async (fieldDef: FieldDefinition) => {
    // Find next available column letter
    const usedColumns = new Set(mappings.map(m => m.column_mapping));
    let columnLetter = '';
    for (let i = 65; i <= 90; i++) { // A-Z
      const letter = String.fromCharCode(i);
      if (!usedColumns.has(letter)) {
        columnLetter = letter;
        break;
      }
    }
    
    // Find next display order
    const nextOrder = mappings.length > 0 
      ? Math.max(...mappings.map(m => m.display_order)) + 1 
      : 1;
    
    try {
      const success = await createFieldMapping(
        userId,
        fieldDef.id,
        columnLetter,
        nextOrder,
        true
      );
      
      if (success) {
        // Update available fields
        setAvailableFields(prev => prev.filter(f => f.id !== fieldDef.id));
        onUpdate(); // Refresh all mappings
      }
    } catch (error) {
      console.error('Error adding field:', error);
    }
  };

  const handleDragStart = (mapping: FieldMapping) => {
    setDraggedItem(mapping);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, overMapping: FieldMapping) => {
    e.preventDefault();
    if (!draggedItem || draggedItem.mapping_id === overMapping.mapping_id) return;

    // Reorder the mappings
    setMappings(prev => {
      const newMappings = [...prev];
      const draggedIndex = newMappings.findIndex(m => m.mapping_id === draggedItem.mapping_id);
      const overIndex = newMappings.findIndex(m => m.mapping_id === overMapping.mapping_id);
      
      // Remove the dragged item
      const [removed] = newMappings.splice(draggedIndex, 1);
      // Insert at the new position
      newMappings.splice(overIndex, 0, removed);
      
      // Update display_order for all items
      return newMappings.map((mapping, index) => ({
        ...mapping,
        display_order: index + 1
      }));
    });
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    
    try {
      // Process updates one by one
      for (const mapping of mappings) {
        const originalMapping = fieldMappings.find(m => m.mapping_id === mapping.mapping_id);
        
        // Only update if something changed
        if (originalMapping && 
            (originalMapping.column_mapping !== mapping.column_mapping ||
             originalMapping.is_enabled !== mapping.is_enabled ||
             originalMapping.display_order !== mapping.display_order)) {
          
          await updateFieldMapping(userId, mapping.field_id, {
            column_mapping: mapping.column_mapping,
            is_enabled: mapping.is_enabled,
            display_order: mapping.display_order
          });
        }
      }
      
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error saving field mappings:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 w-80 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-medium">Edit Field Mappings</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            &times;
          </button>
        </div>
        
        <div className="space-y-2 mb-4">
          <p className="text-xs text-gray-500">
            Map each field to a column in your Google Sheet.
            Use A, B, C, etc. for column identifiers.
            Drag fields to change their order.
          </p>
          
          <div className="divide-y divide-gray-100">
            {mappings.map(mapping => (
              <div 
                key={mapping.mapping_id} 
                className={`py-2 ${draggedItem?.mapping_id === mapping.mapping_id ? 'bg-blue-50' : ''}`}
                draggable
                onDragStart={() => handleDragStart(mapping)}
                onDragOver={(e) => handleDragOver(e, mapping)}
                onDragEnd={handleDragEnd}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-gray-400 text-xs mr-2 cursor-move">≡</span>
                    <span className="font-medium text-sm">{mapping.display_name}</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={mapping.column_mapping}
                      onChange={(e) => handleColumnMappingChange(mapping.mapping_id, e.target.value)}
                      className="border rounded px-2 py-0.5 text-sm w-8 text-center"
                      placeholder="A"
                      maxLength={1}
                      disabled={!mapping.is_enabled}
                    />
                    
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={mapping.is_enabled}
                        onChange={() => handleToggleEnabled(mapping.mapping_id)}
                      />
                      <div className="relative w-8 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {availableFields.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-medium text-gray-700 mb-1">Available Fields</div>
              <div className="divide-y divide-gray-100 border-t border-gray-100 pt-2">
                {availableFields.map(field => (
                  <div key={field.id} className="py-2 flex justify-between items-center">
                    <span className="text-sm text-gray-600">{field.display_name}</span>
                    <button 
                      onClick={() => handleAddField(field)}
                      className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoadingFields && (
            <div className="py-2 text-sm text-gray-500 text-center">
              Loading available fields...
            </div>
          )}
        </div>
        
        <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:bg-blue-400"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldMappingEditor; 