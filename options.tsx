import { useState, useEffect } from "react"
import "./src/globals.css"

type Settings = {
  scanFrequency: "manual" | "daily" | "weekly"
  applyLabels: boolean
  labelName: string
  sheetName: string
}

function OptionsPage() {
  const [settings, setSettings] = useState<Settings>({
    scanFrequency: "manual",
    applyLabels: true,
    labelName: "Processed/Bills",
    sheetName: "Gmail Bill Scanner"
  })
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle")

  // Load settings on mount
  useEffect(() => {
    // In a real implementation, this would load from chrome.storage.local
    // For now, just mock it with default values
    console.log("Loading settings")
  }, [])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target as HTMLInputElement
    
    setSettings(prev => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const saveSettings = async () => {
    setIsSaving(true)
    setSaveStatus("idle")
    
    try {
      // In a real implementation, this would save to chrome.storage.local
      // For now, just mock a delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Send message to background script to update settings
      // This would be implemented with chrome.runtime.sendMessage in a real implementation
      console.log("Settings saved:", settings)
      
      setSaveStatus("success")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch (error) {
      console.error("Failed to save settings:", error)
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-background text-foreground">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-primary">Gmail Bill Scanner Settings</h1>
        <p className="text-muted-foreground">Configure how the extension scans and processes your bills</p>
      </header>

      <main className="space-y-8">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">Scanning Options</h2>
          
          <div className="space-y-2">
            <label className="block font-medium">Scan Frequency</label>
            <select
              name="scanFrequency"
              value={settings.scanFrequency}
              onChange={handleChange}
              className="w-full p-2 border rounded-md bg-background"
            >
              <option value="manual">Manual (Scan when I click the button)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <p className="text-sm text-muted-foreground">
              How often should the extension automatically scan your emails
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">Gmail Integration</h2>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="applyLabels"
              name="applyLabels"
              checked={settings.applyLabels}
              onChange={handleChange}
              className="h-4 w-4"
            />
            <label htmlFor="applyLabels" className="font-medium">
              Apply labels to processed emails
            </label>
          </div>
          
          {settings.applyLabels && (
            <div className="ml-6 space-y-2">
              <label className="block font-medium">Label Name</label>
              <input
                type="text"
                name="labelName"
                value={settings.labelName}
                onChange={handleChange}
                className="w-full p-2 border rounded-md bg-background"
                placeholder="e.g., Bills/Processed"
              />
              <p className="text-sm text-muted-foreground">
                Gmail will create this label if it doesn't exist
              </p>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold border-b pb-2">Google Sheets Integration</h2>
          
          <div className="space-y-2">
            <label className="block font-medium">Sheet Name</label>
            <input
              type="text"
              name="sheetName"
              value={settings.sheetName}
              onChange={handleChange}
              className="w-full p-2 border rounded-md bg-background"
              placeholder="e.g., Gmail Bill Tracker"
            />
            <p className="text-sm text-muted-foreground">
              A new Google Sheet will be created with this name if it doesn't exist
            </p>
          </div>
        </section>

        <div className="pt-4 border-t flex items-center justify-between">
          <div>
            {saveStatus === "success" && (
              <span className="text-green-500">Settings saved successfully!</span>
            )}
            {saveStatus === "error" && (
              <span className="text-red-500">Failed to save settings. Please try again.</span>
            )}
          </div>
          
          <button
            onClick={saveSettings}
            disabled={isSaving}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </main>
      
      <footer className="mt-12 pt-4 border-t text-center text-sm text-muted-foreground">
        Gmail Bill Scanner v0.1.0 • <a href="#" className="underline">Privacy Policy</a>
      </footer>
    </div>
  )
}

export default OptionsPage 