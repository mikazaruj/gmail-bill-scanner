import React from "react";
import ScannedBill from "../../types/ScannedBill";

interface ScanResultsProps {
  bills: ScannedBill[];
}

const ScanResults: React.FC<ScanResultsProps> = ({ bills }) => {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-2">
      {bills.map((bill) => (
        <div 
          key={bill.id}
          className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
        >
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-medium text-gray-800">{bill.merchant}</h3>
              <p className="text-xs text-gray-500">{formatDate(bill.date)}</p>
            </div>
            <span className="font-bold text-gray-900">
              {formatCurrency(bill.amount, bill.currency)}
            </span>
          </div>
          <div className="mt-2 flex justify-between items-center">
            <span className="inline-block px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
              {bill.category}
            </span>
            {bill.billUrl && (
              <a 
                href={bill.billUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                View Bill
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ScanResults; 