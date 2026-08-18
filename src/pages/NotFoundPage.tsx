import { Link } from 'react-router-dom'
export function NotFoundPage() { return <main className="state-page"><span>404</span><h1>Página no encontrada</h1><p>La dirección que buscas no existe en TOM-CONTROL.</p><Link className="primary-button" to="/dashboard">Ir al dashboard</Link></main> }
