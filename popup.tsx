import { useState } from "react"
import "./src/globals.css"

function IndexPopup() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [scanResults, setScanResults] = useState<{
    processed: number
    billsFound: number
    errors: number
  }>({
    processed: 0,
    billsFound: 0,
    errors: 0
  })

  // Check authentication status on component mount
  const checkAuthStatus = async () => {
    // This will be implemented with actual auth checking
    // For now, it's a placeholder
    setIsAuthenticated(false)
  }

  const handleAuthenticate = async () => {
    // This will open the OAuth flow
    // For now, just toggle the state for UI development
    setIsAuthenticated(true)
  }

  const handleStartScan = async () => {
    setIsScanning(true)
    setScanResults({
      processed: 0,
      billsFound: 0,
      errors: 0
    })

    // Simulate scanning progress for UI development
    let processed = 0
    let billsFound = 0
    let errors = 0

    const interval = setInterval(() => {
      processed += 1
      if (Math.random() > 0.7) {
        billsFound += 1
      }
      if (Math.random() > 0.9) {
        errors += 1
      }

      setScanResults({
        processed,
        billsFound,
        errors
      })

      if (processed >= 10) {
        clearInterval(interval)
        setIsScanning(false)
      }
    }, 500)
  }

  return (
    <div className="w-96 p-4 bg-background text-foreground">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-primary">Gmail Bill Scanner</h1>
        <p className="text-sm text-muted-foreground">
          Scan your emails for bills and organize them
        </p>
      </header>

      <main>
        {!isAuthenticated ? (
          <div className="p-4 border rounded-md bg-secondary">
            <h2 className="text-lg font-medium mb-2">Authentication Required</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Please authenticate with your Google account to start scanning your emails.
            </p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              onClick={handleAuthenticate}
            >
              Sign in with Google
            </button>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">Bill Scanner</h2>
              <button
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                onClick={handleStartScan}
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Start Scan"}
              </button>
            </div>

            {isScanning && (
              <div className="h-2 bg-secondary rounded-full mb-4 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-in-out"
                  style={{ width: `${(scanResults.processed / 10) * 100}%` }}
                ></div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="p-3 border rounded-md bg-secondary/50">
                <div className="text-2xl font-bold">{scanResults.processed}</div>
                <div className="text-xs text-muted-foreground">Emails Processed</div>
              </div>
              <div className="p-3 border rounded-md bg-secondary/50">
                <div className="text-2xl font-bold">{scanResults.billsFound}</div>
                <div className="text-xs text-muted-foreground">Bills Found</div>
              </div>
              <div className="p-3 border rounded-md bg-secondary/50">
                <div className="text-2xl font-bold">{scanResults.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Recent Activity</h3>
              {scanResults.billsFound > 0 ? (
                <div className="space-y-2">
                  {Array.from({ length: scanResults.billsFound }).map((_, i) => (
                    <div key={i} className="p-3 border rounded-md flex justify-between items-center">
                      <div>
                        <div className="font-medium">
                          {["Electric Company", "Water Utility", "Internet Provider", "Phone Service"][
                            i % 4
                          ]}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Due {new Date(Date.now() + (i + 1) * 3 * 24 * 60 * 60 * 1000).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-lg font-bold">
                        ${(Math.random() * 100 + 20).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 border rounded-md bg-secondary/30 text-center text-muted-foreground">
                  No bills found yet. Start a scan to find bills in your inbox.
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="mt-6 pt-4 border-t text-xs text-muted-foreground flex justify-between">
        <div>Gmail Bill Scanner v0.1.0</div>
        <div>
          <a href="#" className="underline">Settings</a>
        </div>
      </footer>
    </div>
  )
}

export default IndexPopup
