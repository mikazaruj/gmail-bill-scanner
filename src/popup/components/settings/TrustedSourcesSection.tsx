import React, { useEffect } from 'react';
import CollapsibleSection from '../CollapsibleSection';
import EmailSourceItem from '../EmailSourceItem';
import AddTrustedSourceModal from '../AddTrustedSourceModal';
import ConfirmDeleteModal from '../ConfirmDeleteModal';
import { useTrustedSources } from '../../hooks/settings/useTrustedSources';

interface TrustedSourcesSectionProps {
  userId: string | null;
}

const TrustedSourcesSection = ({ userId }: TrustedSourcesSectionProps) => {
  const {
    trustedSources,
    isLoading,
    isAddModalOpen,
    isDeleteModalOpen,
    emailToDelete,
    isDeleteAction,
    maxTrustedSources,
    isLimited,
    loadTrustedSources,
    handleShowAddModal,
    handleCloseAddModal,
    handleAddSource,
    handleShowDeleteModal,
    handleCloseDeleteModal,
    handleDeleteSource
  } = useTrustedSources();

  // Load trusted sources on component mount
  useEffect(() => {
    const fetchSources = async () => {
      if (userId) {
        await loadTrustedSources(userId);
      }
    };
    
    fetchSources();
  }, [userId, loadTrustedSources]);

  return (
    <CollapsibleSection title="Trusted Email Sources" defaultOpen={true}>
      {isLoading ? (
        <div className="py-2 text-sm text-gray-500">Loading trusted sources...</div>
      ) : (
        <>
          <div className="space-y-1.5 mb-1.5">
            {trustedSources.map(source => (
              <EmailSourceItem
                key={source.id || source.email_address}
                email={source.email_address || ''}
                description={source.description}
                onRemove={() => handleShowDeleteModal(source.email_address, false)}
                onDelete={() => handleShowDeleteModal(source.email_address, true)}
              />
            ))}
          </div>
          
          {/* Debug information */}
          {console.log('Debug trusted sources:', { 
            trustedSourcesLength: trustedSources.length, 
            maxTrustedSources, 
            isLimited,
            isButtonDisabled: trustedSources.length >= maxTrustedSources
          })}
          
          <button 
            className="w-full p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors"
            onClick={handleShowAddModal}
            disabled={isLimited && trustedSources.length >= maxTrustedSources}
          >
            + Add trusted source
          </button>
          
          <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
            <span>
              {trustedSources.length > 0 
                ? `${trustedSources[0].total_sources} of ${trustedSources[0].max_trusted_sources} sources used` 
                : `0 of ${maxTrustedSources} sources used`}
            </span>
            {isLimited && (
              <span className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">
                Upgrade for unlimited
              </span>
            )}
          </div>
          
          {/* Modals */}
          <AddTrustedSourceModal
            isOpen={isAddModalOpen}
            onClose={handleCloseAddModal}
            onAdd={handleAddSource}
            maxSourcesReached={isLimited && trustedSources.length >= maxTrustedSources}
          />
          
          <ConfirmDeleteModal
            isOpen={isDeleteModalOpen}
            onClose={handleCloseDeleteModal}
            onConfirm={handleDeleteSource}
            email={emailToDelete}
            isDelete={isDeleteAction}
          />
        </>
      )}
    </CollapsibleSection>
  );
};

export default TrustedSourcesSection; 