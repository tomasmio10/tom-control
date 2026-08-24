import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CommissionPaymentModal } from '../components/commissions/CommissionPaymentModal'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../data/mockData'
import { getCommissionDetail } from '../lib/commissions'
import type { SellerCommissionDetail } from '../types'

const statusLabels = { new: 'Pendiente', preparing: 'Preparando', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado' }

export function SellerCommissionDetailPage() {
  const { sellerId = '' } = useParams()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [detail, setDetail] = useState<SellerCommissionDetail | null>(null)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const refresh = useCallback(async () => {
    if (!sellerId) return
    setLoading(true); setError('')
    try { setDetail(await getCommissionDetail(sellerId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar el detalle.') }
    finally { setLoading(false) }
  }, [sellerId])
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer) }, [refresh])

  return <>
    {success && <div className="success-banner" role="status"><span>✓</span><div><strong>{success}</strong><small>Saldo actualizado desde Supabase.</small></div><button type="button" onClick={() => setSuccess('')} aria-label="Cerrar confirmación">×</button></div>}
    <PageHeader eyebrow="DETALLE DE COMISIÓN" title={detail?.summary.fullName ?? 'Comisión del vendedor'} description="Ventas, comisiones pagables, valores cancelados e historial de pagos." action={<Link className="secondary-button" to="/comisiones">← Volver a comisiones</Link>} />
    {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar el detalle</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refresh()}>Reintentar</button></div>}
    {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando detalle desde Supabase…</strong></div> : detail && <>
      {admin ? <section className="stats-grid commission-detail-stats"><StatCard label="Ventas válidas" value={formatCurrency(detail.summary.validSales)} detail="Pedidos no cancelados" tone="blue" /><StatCard label="Comisión pagable" value={formatCurrency(detail.summary.payableCommission)} detail="Generada por ventas válidas" tone="green" /><StatCard label="Comisión cancelada" value={formatCurrency(detail.summary.cancelledCommission)} detail="Solo informativa" tone="slate" /><StatCard label="Comisión pagada" value={formatCurrency(detail.summary.paidCommission)} detail="Historial inmutable" tone="green" /><StatCard label="Pagada en exceso" value={formatCurrency(detail.summary.overpaidCommission)} detail="Compensa futuras comisiones" tone="slate" /><StatCard label="Saldo pendiente" value={formatCurrency(detail.summary.pendingCommission)} detail="Disponible para pago" tone="amber" /></section> : <section className="stats-grid compact"><StatCard label="Comisiones totales" value={formatCurrency(detail.summary.payableCommission)} detail="Acumuladas en ventas válidas" tone="blue" /><StatCard label="Comisiones pagadas" value={formatCurrency(detail.summary.paidCommission)} detail="Pagos registrados" tone="green" /><StatCard label="Comisiones no pagadas" value={formatCurrency(detail.summary.pendingCommission)} detail="Saldo pendiente actual" tone="amber" /></section>}
      {admin && <div className="commission-detail-action"><button type="button" className="primary-button" disabled={detail.summary.pendingCommission <= 0} onClick={() => setPaymentOpen(true)}>Registrar pago de comisión</button></div>}
      <section className="panel commission-detail-panel"><div className="panel-heading"><div><h2>Ventas que generaron comisión</h2><p>Los pedidos cancelados permanecen visibles y su comisión no es pagable.</p></div></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Venta</th><th>Comisión</th><th>Estado comisión</th></tr></thead><tbody>{detail.sales.map((sale) => { const commissionState = getSaleCommissionState(sale.isPayable, detail); return <tr key={sale.orderId}><td><Link to={`/pedidos/${sale.orderId}`}><strong>#{sale.orderNumber}</strong></Link></td><td>{formatDate(sale.createdAt)}</td><td><span className={`status ${sale.status}`}>{statusLabels[sale.status]}</span></td><td className="money">{formatCurrency(sale.saleTotal)}</td><td className="money">{formatCurrency(sale.sellerCommissionAmount)}</td><td><span className={`commission-treatment ${commissionState.tone}`}>{commissionState.label}</span></td></tr> })}</tbody></table>{!detail.sales.length && <div className="empty-state">No hay ventas con información financiera para este vendedor.</div>}</div></section>
      <section className="panel commission-detail-panel"><div className="panel-heading"><div><h2>Historial de pagos</h2><p>Registros inmutables de pagos de comisión.</p></div></div><div className="table-wrap"><table><thead><tr><th>Fecha pagada</th><th>Valor</th><th>Nota</th><th>Registrado</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{formatDate(payment.paymentDate)}</td><td className="money collected-money">{formatCurrency(payment.amount)}</td><td>{payment.note || 'Sin nota'}</td><td>{formatDate(payment.createdAt)}</td></tr>)}</tbody></table>{!detail.payments.length && <div className="empty-state">Todavía no hay pagos de comisión registrados.</div>}</div></section>
      {paymentOpen && <CommissionPaymentModal seller={detail.summary} onClose={() => setPaymentOpen(false)} onPaid={async () => { await refresh(); setSuccess('Pago de comisión registrado correctamente.') }} />}
    </>}
  </>
}

function formatDate(value: string) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value)
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'America/Bogota' }).format(date)
}

function getSaleCommissionState(isPayable: boolean, detail: SellerCommissionDetail) {
  if (!isPayable) return { label: 'No pagable', tone: 'informative' }
  if (detail.summary.paidCommission <= 0) return { label: 'Pendiente', tone: 'pending' }
  if (detail.summary.pendingCommission <= 0) return { label: 'Pagada', tone: 'payable' }
  return { label: 'Pago parcial global', tone: 'partial' }
}
