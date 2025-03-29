import React from 'react';
import { BillData, BillFieldConfig } from '../../types/Message';

interface ScanResultsProps {
  results: BillData[];
  billFields: BillFieldConfig[];
}

const ScanResults = ({ results, billFields }: ScanResultsProps) => {
  if (!results || results.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No bills found in the scan. Try adjusting your scan settings.
      </div>
    );
  }

  const renderBillValue = (bill: BillData, field: BillFieldConfig) => {
    const value = bill[field.id];
    if (value === undefined) return 'N/A';

    switch (field.type) {
      case 'number':
        return typeof value === 'number' ? `$${value.toFixed(2)}` : value;
      case 'date':
        return value instanceof Date ? value.toLocaleDateString() : value;
      default:
        return String(value);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-md font-medium text-gray-900">Scan Results ({results.length})</h3>
      
      <div className="space-y-2 max-h-80 overflow-auto pr-1">
        {results.map((bill, index) => (
          <div key={index} className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
            <div className="flex justify-between mb-2">
              <div className="text-sm font-medium text-gray-900">{bill.vendor || 'Unknown Vendor'}</div>
              <div className="text-sm font-bold text-green-600">{typeof bill.amount === 'number' ? `$${bill.amount.toFixed(2)}` : 'N/A'}</div>
            </div>
            
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              {billFields.filter(field => field.enabled).map(field => (
                <div key={field.id} className="text-xs">
                  <span className="text-gray-500">{field.label}: </span>
                  <span className="text-gray-900">{renderBillValue(bill, field)}</span>
                </div>
              ))}
              
              <div className="text-xs col-span-2 mt-1">
                <span className="text-gray-500">Source: </span>
                <span className="text-gray-900 italic">{bill.emailId ? 'Email' : 'Attachment'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScanResults; 