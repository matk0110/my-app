import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerLicense } from '@syncfusion/ej2-base'
import './index.css'
import App from './App.tsx'

const syncfusionLicenseKey = import.meta.env.VITE_SYNCFUSION_LICENSE_KEY

if (syncfusionLicenseKey) {
  registerLicense(syncfusionLicenseKey)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
