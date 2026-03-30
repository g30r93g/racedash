import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { RaceDashClerkProvider } from './provider/ClerkProvider'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundary } from './components/ErrorBoundary'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RaceDashClerkProvider>
        <App />
        <Toaster />
      </RaceDashClerkProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
