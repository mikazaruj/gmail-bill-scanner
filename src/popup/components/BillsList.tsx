import React from 'react';
import { Bill } from '../../types/Bill';

interface BillsListProps {
  bills: {
    emailId: string;
    emailDate: Date;
    emailSubject: string;
    bill: Bill;
  }[];
  loading: boolean;
}

/**
 * BillsList component for displaying extracted bills with language grouping
 * Supports both English and Hungarian bills
 */
const BillsList: React.FC<BillsListProps> = ({ bills, loading }) => {
  if (loading) {
    return <div className="flex items-center justify-center p-4">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
      <span className="text-blue-600">Scanning for bills...</span>
    </div>;
  }
  
  if (!bills || bills.length === 0) {
    return <div className="text-center py-8 text-gray-500">
      No bills found. Try adjusting your search criteria or scan preferences.
    </div>;
  }
  
  // Group by language
  const groupedBills: Record<string, typeof bills> = {};
  
  bills.forEach(bill => {
    const language = bill.bill.language;
    if (!groupedBills[language]) {
      groupedBills[language] = [];
    }
    groupedBills[language].push(bill);
  });
  
  return (
    <div className="bills-list space-y-6">
      {Object.entries(groupedBills).map(([language, languageBills]) => (
        <div key={language} className="language-group">
          <h2 className="text-lg font-medium mb-3 text-blue-700 border-b pb-2">
            {language === 'en' ? 'English' : 'Hungarian'} Bills ({languageBills.length})
          </h2>
          
          <div className="bills-container grid grid-cols-1 md:grid-cols-2 gap-4">
            {languageBills.map(item => (
              <div key={item.emailId} className="bill-card bg-white shadow-sm rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
                <div className="bill-header flex justify-between items-start mb-2">
                  <span className="bill-date text-sm text-gray-500">
                    {item.emailDate.toLocaleDateString(
                      item.bill.language === 'hu' ? 'hu-HU' : 'en-US'
                    )}
                  </span>
                  <span className="bill-type text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                    {item.bill.type.split('-')[1]}
                  </span>
                </div>
                
                <h3 className="bill-vendor text-base font-medium mb-1 truncate">
                  {item.bill.vendor || 'Unknown Vendor'}
                </h3>
                
                <div className="bill-amount text-lg font-bold mb-2 text-green-700">
                  {formatCurrency(
                    item.bill.amount, 
                    item.bill.currency, 
                    item.bill.language
                  )}
                </div>
                
                {item.bill.dueDate && (
                  <div className="bill-due-date text-sm mb-1">
                    <span className="font-medium">
                      {item.bill.language === 'hu' ? 'Határidő:' : 'Due:'}
                    </span> {formatDate(item.bill.dueDate, item.bill.language)}
                  </div>
                )}
                
                {item.bill.accountNumber && (
                  <div className="bill-account text-sm mb-2 text-gray-600">
                    <span className="font-medium">
                      {item.bill.language === 'hu' ? 'Azonosító:' : 'Account:'}
                    </span> {item.bill.accountNumber}
                  </div>
                )}
                
                <div className="bill-subject text-xs text-gray-500 mt-2 truncate">
                  {item.emailSubject}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper for currency formatting
function formatCurrency(amount: number, currency: string, language: string): string {
  const locale = language === 'hu' ? 'hu-HU' : 'en-US';
  
  try {
    return new Intl.NumberFormat(locale, { 
      style: 'currency', 
      currency,
      maximumFractionDigits: currency === 'HUF' ? 0 : 2
    }).format(amount);
  } catch (error) {
    // Fallback if currency code is invalid
    return `${amount.toLocaleString(locale)} ${currency}`;
  }
}

// Helper for date formatting
function formatDate(date: Date, language: string): string {
  const locale = language === 'hu' ? 'hu-HU' : 'en-US';
  return new Intl.DateTimeFormat(locale).format(date);
}

export default BillsList; 