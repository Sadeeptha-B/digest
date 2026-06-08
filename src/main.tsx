import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { bootstrapAccentTheme } from './lib/themes'
import './index.css'

// Apply the saved accent palette before first paint (no flash of the default).
bootstrapAccentTheme()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>,
)
