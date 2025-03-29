import React, { useState } from 'react';
import { X } from 'lucide-react';

interface AddTrustedSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (email: string, description?: string) => void;
  maxSourcesReached: boolean;
}

const AddTrustedSourceModal = ({ isOpen, onClose, onAdd, maxSourcesReached }: AddTrustedSourceModalProps) => {
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    onAdd(email, description);
    setEmail('');
    setDescription('');
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900">Add Trusted Source</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {maxSourcesReached ? (
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              You've reached the maximum number of trusted sources for the free plan.
            </div>
            <button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
              onClick={onClose}
            >
              Upgrade for Unlimited Sources
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Email Address</label>
              <input
                type="email"
                className={`w-full p-2 border ${error ? 'border-red-500' : 'border-gray-300'} rounded-lg text-sm`}
                placeholder="example@domain.com"
                value={email}
                onChange={(e: { target: { value: string } }) => {
                  setEmail(e.target.value);
                  setError('');
                }}
              />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <p className="text-xs text-gray-500">Add email addresses of services that send you bills</p>
            </div>
            
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Description (Optional)</label>
              <input
                type="text"
                className="w-full p-2 border border-gray-300 rounded-lg text-sm"
                placeholder="E.g., Electric Company"
                value={description}
                onChange={(e: { target: { value: string } }) => setDescription(e.target.value)}
              />
              <p className="text-xs text-gray-500">Add a description to help identify this source</p>
            </div>

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-medium transition-colors"
              >
                Add Source
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AddTrustedSourceModal; 