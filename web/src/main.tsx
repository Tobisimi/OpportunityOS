import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { configureAmplify } from './aws-config.ts'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Application root element was not found.')
}

const root = createRoot(rootElement)

try {
  configureAmplify()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown configuration error'

  root.render(
    <main className="auth-shell">
      <section className="authenticated-panel" role="alert">
        <p className="eyebrow">CONFIGURATION ERROR</p>
        <h1>Scout is not connected</h1>
        <p>{message}</p>
      </section>
    </main>,
  )
}
