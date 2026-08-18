import { Link } from 'react-router-dom'
export function UnauthorizedPage() { return <main className="state-page"><span>403</span><h1>Acceso restringido</h1><p>Tu perfil no tiene permisos para consultar esta sección.</p><Link className="primary-button" to="/dashboard">Volver al dashboard</Link></main> }
