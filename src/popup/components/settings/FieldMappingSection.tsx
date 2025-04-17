import React from 'react';
import CollapsibleSection from '../CollapsibleSection';
import { FieldMapping } from '../../../services/fieldMapping';

interface FieldMappingSectionProps {
  userId: string | null;
  fieldMappings: FieldMapping[];
  isLoading: boolean;
}

const FieldMappingSection = ({
  userId,
  fieldMappings,
  isLoading
}: FieldMappingSectionProps) => {
  const handleEditFieldMapping = () => {
    // This would typically open a modal or navigate to a field mapping editor
    // For now we'll just show an alert
    alert('Field mapping editor will be implemented in a future update.');
  };

  return (
    <CollapsibleSection title="Field Mapping" defaultOpen={false}>
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading field mappings...</div>
      ) : (
        <>
          <div className="mb-2">
            <div className="text-xs text-gray-500 mb-1.5">Current mapping:</div>
            <div className="grid grid-cols-2 gap-1.5">
              {fieldMappings.map(mapping => (
                <div 
                  key={mapping.mapping_id} 
                  className="bg-white p-1.5 rounded-lg border border-gray-200 text-xs flex items-center"
                >
                  <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center mr-1.5 text-gray-800 font-medium">
                    {mapping.column_mapping}
                  </div>
                  <span className="text-gray-900">{mapping.display_name}</span>
                </div>
              ))}
            </div>
          </div>
          <button 
            className="w-full p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors"
            onClick={handleEditFieldMapping}
          >
            Edit Field Mapping
          </button>
        </>
      )}
    </CollapsibleSection>
  );
};

export default FieldMappingSection; 