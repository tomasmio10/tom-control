import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CommissionPaymentModal } from '../components/commissions/CommissionPaymentModal'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../data/mockData'
import { getCommissionPaymentsThisMonth, getCommissionSummary } from '../lib/commissions'
import type { SellerCommissionSummary } from '../types'

export function CommissionsPage() {
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [sellers, setSellers] = useState<SellerCommissionSummary[]>([])
  const [payingSeller, setPayingSeller] = useState<SellerCommissionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [paidThisMonth, setPaidThisMonth] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [summary, monthlyPaid] = await Promise.all([getCommissionSummary(), admin ? getCommissionPaymentsThisMonth() : Promise.resolve(0)])
      setSellers(summary); setPaidThisMonth(monthlyPaid)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar las comisiones.') }
    finally { setLoading(false) }
  }, [admin])
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer) }, [refresh])

  const totals = sellers.reduce((result, seller) => ({ sales: result.sales + seller.validSales, generated: result.generated + seller.payableCommission, paid: result.paid + seller.paidCommission, overpaid: result.overpaid + seller.overpaidCommission, pending: result.pending + seller.pendingCommission }), { sales: 0, generated: 0, paid: 0, overpaid: 0, pending: 0 })

  return <>
    {success && <div className="success-banner" role="status"><span>✓</span><div><strong>{success}</strong><small>El historial y el saldo se actualizaron desde Supabase.</small></div><button type="button" onClick={() => setSuccess('')} aria-label="Cerrar confirmación">×</button></div>}
    <PageHeader eyebrow="CONTROL COMERCIAL" title={admin ? 'Comisiones' : 'Mis comisiones'} description={admin ? 'Controla las comisiones pagables y su historial por vendedor.' : 'Consulta tus ventas válidas, pagos y saldo de comisión.'} />
    {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar las comisiones</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refresh()}>Reintentar</button></div>}
    {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando comisiones desde Supabase…</strong></div> : admin ? <>
      <section className="stats-grid compact"><StatCard label="Total comisiones pendientes" value={formatCurrency(totals.pending)} detail="Saldo actual de todos los vendedores" tone="amber" /><StatCard label="Comisiones pagadas este mes" value={formatCurrency(paidThisMonth)} detail="Pagos registrados en el mes actual" tone="green" /><StatCard label="Vendedores con saldo pendiente" value={String(sellers.filter((seller) => seller.pendingCommission > 0).length)} detail="Vendedores por pagar" tone="blue" /></section>
      <section className="panel"><div className="panel-heading"><div><h2>Gestión de comisiones</h2><p>Registra pagos y consulta el detalle de cada vendedor.</p></div></div><div className="table-wrap commission-table"><table><thead><tr><th>Vendedor</th><th>Comisiones totales</th><th>Comisiones pagadas</th><th>Comisiones no pagadas</th><th>Acción</th></tr></thead><tbody>{sellers.map((seller) => <tr key={seller.sellerId}><td><Link className="commission-seller-link" to={`/comisiones/${seller.sellerId}`}>{seller.fullName}</Link></td><td className="money">{formatCurrency(seller.payableCommission)}</td><td className="money collected-money">{formatCurrency(seller.paidCommission)}</td><td className="money due-money">{formatCurrency(seller.pendingCommission)}</td><td><div className="commission-actions"><Link className="secondary-button" to={`/comisiones/${seller.sellerId}`}>Ver detalle</Link><button type="button" className="primary-button" disabled={seller.pendingCommission <= 0} onClick={() => setPayingSeller(seller)}>Registrar pago</button></div></td></tr>)}</tbody></table>{!sellers.length && !error && <div className="empty-state">No hay vendedores con información de comisiones.</div>}</div></section>
    </> : <><section className="stats-grid compact"><StatCard label="Comisiones totales" value={formatCurrency(totals.generated)} detail="Acumuladas en ventas válidas" tone="blue" /><StatCard label="Comisiones pagadas" value={formatCurrency(totals.paid)} detail="Pagos registrados" tone="green" /><StatCard label="Comisiones no pagadas" value={formatCurrency(totals.pending)} detail="Saldo pendiente actual" tone="amber" /></section><section className="panel seller-commission-overview"><div><h2>Detalle de mis comisiones</h2><p>Consulta las ventas que generaron comisión y el historial de pagos.</p></div>{sellers[0] && <Link className="primary-button" to={`/comisiones/${sellers[0].sellerId}`}>Ver detalle</Link>}</section></>}
    {payingSeller && <CommissionPaymentModal seller={payingSeller} onClose={() => setPayingSeller(null)} onPaid={async () => { await refresh(); setSuccess(`Pago de comisión registrado para ${payingSeller.fullName}.`) }} />}
  </>
}
