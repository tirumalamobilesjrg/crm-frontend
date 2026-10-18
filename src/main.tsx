import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { envProblem } from './lib/supabase'

const root = createRoot(document.getElementById('root')!)

if (envProblem) {
  root.render(
    <main className="center-card" role="alert">
      <h1>Configuration problem</h1>
      <p>{envProblem}</p>
    </main>,
  )
} else {
  // Loaded lazily so a bad configuration never creates a Supabase client.
  void import('./App').then(({ App }) => root.render(<StrictMode><App /></StrictMode>))
}
