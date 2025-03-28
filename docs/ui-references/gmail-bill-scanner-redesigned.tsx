import React, { useState } from 'react';
import { 
  Shield, Settings, Mail, ChevronDown, ChevronUp, X,
  FileSpreadsheet, Clock, RefreshCcw, BarChart2,
  AlertTriangle, Check, User, Calendar, PieChart
} from 'lucide-react';

const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-3">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-4 flex items-center justify-between bg-white text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-900">{title}</span>
        {isOpen ? (
          <ChevronUp size={18} className="text-gray-500" />
        ) : (
          <ChevronDown size={18} className="text-gray-500" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          {children}
        </div>
      )}
    </div>
  );
};

const GmailBillScannerUI = () => {
  const [showSettings, setShowSettings] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true);
  
  return (
    <div className="w-80 bg-white font-sans rounded-lg overflow-hidden shadow-lg">
      {/* Header */}
      <div className="p-5 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <Shield size={18} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Gmail Bill Scanner</h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`text-gray-600 hover:text-gray-900 transition-colors ${showSettings ? 'text-blue-600' : ''}`}
          >
            <Settings size={20} />
          </button>
          <button className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
            <User size={18} className="text-gray-700" />
          </button>
        </div>
      </div>
      
      {/* Free Plan Banner (Dismissible) */}
      {showUpgradeBanner && (
        <div className="m-4 bg-blue-50 rounded-lg p-3 flex items-center justify-between border border-blue-100">
          <div>
            <div className="text-base font-medium text-blue-900">Free Plan</div>
            <div className="text-sm text-blue-700">5 days left in trial</div>
          </div>
          <div className="flex items-center">
            <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition-colors mr-2">
              Upgrade
            </button>
            <button 
              onClick={() => setShowUpgradeBanner(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <div className="p-4">
        {!showSettings ? (
          /* Dashboard View */
          <div className="space-y-4">
            {/* Stats Dashboard */}
            <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Dashboard</h2>
                <div className="flex items-center text-xs text-gray-500">
                  <Clock size={14} className="mr-1" />
                  <span>Last run: 2d ago</span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <div className="flex items-center mb-1">
                    <BarChart2 size={14} className="text-blue-600 mr-1.5" />
                    <span className="text-xs text-gray-500">Success Rate</span>
                  </div>
                  <div className="text-lg font-bold text-blue-900">96%</div>
                  <div className="text-xs text-blue-700">
                    <span className="font-medium">127</span> emails processed
                  </div>
                </div>
                
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                  <div className="flex items-center mb-1">
                    <Clock size={14} className="text-green-600 mr-1.5" />
                    <span className="text-xs text-gray-500">Time Saved</span>
                  </div>
                  <div className="text-lg font-bold text-green-900">3.7 hrs</div>
                  <div className="text-xs text-green-700">
                    <span className="font-medium">94</span> bills extracted
                  </div>
                </div>
                
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <div className="flex items-center mb-1">
                    <PieChart size={14} className="text-indigo-600 mr-1.5" />
                    <span className="text-xs text-gray-500">This Month</span>
                  </div>
                  <div className="text-lg font-bold text-indigo-900">5.6 hrs</div>
                  <div className="text-xs text-indigo-700">total time saved</div>
                </div>
                
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
                  <div className="flex items-center mb-1">
                    <Calendar size={14} className="text-amber-600 mr-1.5" />
                    <span className="text-xs text-gray-500">Per Bill</span>
                  </div>
                  <div className="text-lg font-bold text-amber-900">2.4 min</div>
                  <div className="text-xs text-amber-700">avg. time saved</div>
                </div>
              </div>
              
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600" style={{ width: '96%' }}></div>
              </div>
            </div>
            
            {/* Recent Activity */}
            <CollapsibleSection title="Recent Activity" defaultOpen={true}>
              <div className="space-y-2">
                <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex">
                      <Check size={16} className="text-green-500 mr-2 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">Auto-processed 15 emails</div>
                        <div className="text-xs text-gray-500">9 bills found, 0 errors</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">2d ago</div>
                  </div>
                </div>
                
                <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex">
                      <AlertTriangle size={16} className="text-amber-500 mr-2 mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">3 extraction failures</div>
                        <div className="text-xs text-gray-500">Format not recognized</div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">5d ago</div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
            
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center text-sm font-medium transition-colors">
              <RefreshCcw size={16} className="mr-2" />
              Run Manual Processing
            </button>
          </div>
        ) : (
          /* Settings View */
          <div className="space-y-4">
            <CollapsibleSection title="Connected Services" defaultOpen={true}>
              <div className="space-y-2">
                <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center mr-3">
                        <Mail size={16} className="text-red-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">Gmail</div>
                        <div className="text-xs text-gray-500">user@gmail.com</div>
                      </div>
                    </div>
                    <div className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                      Connected
                    </div>
                  </div>
                </div>
                
                <div className="p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                        <FileSpreadsheet size={16} className="text-green-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">Google Sheets</div>
                        <div className="text-xs text-gray-500">Bills Tracker</div>
                      </div>
                    </div>
                    <button className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium transition-colors">
                      Change
                    </button>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
            
            <CollapsibleSection title="Trusted Email Sources" defaultOpen={true}>
              <div className="space-y-2 mb-2">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <span className="text-sm text-gray-900">electric-bills@example.com</span>
                  <button className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <span className="text-sm text-gray-900">internet-service@example.net</span>
                  <button className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <span className="text-sm text-gray-900">water-utility@example.org</span>
                  <button className="text-gray-400 hover:text-red-500 transition-colors">
                    <X size={16} />
                  </button>
                </div>
              </div>
              
              <button className="w-full mt-2 p-2 border border-dashed border-gray-300 hover:border-gray-400 bg-white rounded-lg text-sm flex items-center justify-center text-gray-700 hover:text-gray-900 transition-colors">
                + Add trusted source
              </button>
              
              <div className="flex items-center justify-between text-xs text-gray-500 mt-3">
                <span>3 of 3 sources used</span>
                <span className="text-blue-600 hover:text-blue-800 cursor-pointer transition-colors">Upgrade for unlimited</span>
              </div>
            </CollapsibleSection>
            
            <CollapsibleSection title="Processing Options" defaultOpen={true}>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <span className="text-sm text-gray-900">Automatic processing</span>
                  <div className="relative inline-block w-10 align-middle select-none">
                    <input type="checkbox" name="toggle1" id="toggle1" className="sr-only" defaultChecked />
                    <div className="block bg-gray-300 w-10 h-6 rounded-full"></div>
                    <div className="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform translate-x-4 shadow-sm"></div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <div className="flex items-center">
                    <span className="text-sm text-gray-900">Weekly schedule</span>
                    <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-medium rounded">PRO</span>
                  </div>
                  <div className="relative inline-block w-10 align-middle select-none opacity-50">
                    <input type="checkbox" name="toggle2" id="toggle2" className="sr-only" disabled />
                    <div className="block bg-gray-300 w-10 h-6 rounded-full"></div>
                    <div className="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition shadow-sm"></div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <span className="text-sm text-gray-900">Process attachments</span>
                  <div className="relative inline-block w-10 align-middle select-none">
                    <input type="checkbox" name="toggle3" id="toggle3" className="sr-only" defaultChecked />
                    <div className="block bg-gray-300 w-10 h-6 rounded-full"></div>
                    <div className="dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition transform translate-x-4 shadow-sm"></div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
            
            <CollapsibleSection title="Field Mapping" defaultOpen={false}>
              <div className="mb-3">
                <div className="text-xs text-gray-500 mb-2">Current mapping:</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white p-2 rounded-lg border border-gray-200 text-xs flex items-center">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium">
                      A
                    </div>
                    <span className="text-gray-900">Vendor</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200 text-xs flex items-center">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium">
                      B
                    </div>
                    <span className="text-gray-900">Amount</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200 text-xs flex items-center">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium">
                      C
                    </div>
                    <span className="text-gray-900">Due Date</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-gray-200 text-xs flex items-center">
                    <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center mr-2 text-gray-800 font-medium">
                      D
                    </div>
                    <span className="text-gray-900">Category</span>
                  </div>
                </div>
              </div>
              <button className="w-full p-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition-colors">
                Edit Field Mapping
              </button>
            </CollapsibleSection>

            <button 
              onClick={() => setShowSettings(false)}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 px-4 rounded-lg flex items-center justify-center text-sm font-medium transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        )}
      </div>
      
      {/* Footer */}
      <div className="px-4 py-3 text-xs text-gray-500 text-center border-t border-gray-200 bg-gray-50">
        Secure client-side processing • v1.0.0
      </div>
    </div>
  );
};

export default GmailBillScannerUI;
