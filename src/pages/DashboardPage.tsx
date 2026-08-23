import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { formatCurrency } from '../data/mockData'
import { supabase } from '../lib/supabase'
import type { Order, PaymentStatus } from '../types'
import '../dashboard.css'

type Period = 'today' | 'week' | 'month' | 'all'
interface PaymentRow { order_id: string; amount: number; is_voided: boolean }
interface ProfileRow { id: string; full_name: string }

const periodOptions: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Hoy' }, { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' }, { value: 'all', label: 'Todo' },
]
const paymentLabels: Record<PaymentStatus, string> = { pending: 'Pendiente', partial: 'Pago parcial', paid: 'Pagado' }

function periodStart(period: Period) {
  if (period === 'all') return null
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7))
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { getOrdersForUser, loading, error, refreshOrders } = useOrders()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [period, setPeriod] = useState<Period>('month')
  const [paymentsByOrder, setPaymentsByOrder] = useState<Map<string, number>>(new Map())
  const [sellerNames, setSellerNames] = useState<Map<string, string>>(new Map())
  const [dashboardLoading, setDashboardLoading] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const visibleOrders = getOrdersForUser(user)
  const visibleOrderIds = useMemo(() => visibleOrders.map((order) => order.id), [visibleOrders])

  const refreshDashboardData = useCallback(async () => {
    if (!admin || !visibleOrderIds.length) {
      setPaymentsByOrder(new Map()); setSellerNames(new Map()); setDashboardError(''); return
    }
    setDashboardLoading(true); setDashboardError('')
    const sellerIds = [...new Set(visibleOrders.map((order) => order.sellerId))]
    const [paymentsResponse, profilesResponse] = await Promise.all([
      supabase.from('order_payments').select('order_id, amount, is_voided').in('order_id', visibleOrderIds),
      supabase.from('profiles').select('id, full_name').in('id', sellerIds),
    ])
    if (paymentsResponse.error || profilesResponse.error) {
      setDashboardError(paymentsResponse.error?.message || profilesResponse.error?.message || 'No fue posible cargar los datos del Dashboard.')
      setDashboardLoading(false); return
    }
    const totals = new Map<string, number>()
    ;((paymentsResponse.data ?? []) as PaymentRow[]).forEach((payment) => {
      if (!payment.is_voided) totals.set(payment.order_id, (totals.get(payment.order_id) ?? 0) + Number(payment.amount))
    })
    setPaymentsByOrder(totals)
    setSellerNames(new Map(((profilesResponse.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.full_name])))
    setDashboardLoading(false)
  }, [admin, visibleOrderIds, visibleOrders])

  useEffect(() => { const timer = window.setTimeout(() => void refreshDashboardData(), 0); return () => window.clearTimeout(timer) }, [refreshDashboardData])

  const start = periodStart(period)
  const periodOrders = visibleOrders.filter((order) => !start || new Date(order.createdAt) >= start)
  const validOrders = periodOrders.filter((order) => order.databaseStatus !== 'cancelled')
  const amountPaid = (order: Order) => Math.min(order.total, Math.max(0, paymentsByOrder.get(order.id) ?? 0))
  const sales = validOrders.reduce((sum, order) => sum + order.total, 0)
  const collected = validOrders.reduce((sum, order) => sum + amountPaid(order), 0)
  const receivable = Math.max(0, sales - collected)
  const activeOrders = validOrders.filter((order) => order.total - amountPaid(order) > 0).length
  const sellerCommissions = validOrders.reduce((sum, order) => sum + order.sellerCommission, 0)
  const adminCommissions = validOrders.reduce((sum, order) => sum + order.adminCommission, 0)
  const companyProfit = validOrders.reduce((sum, order) => sum + order.companyProfit, 0)
  const margin = sales > 0 ? (companyProfit / sales) * 100 : 0
  const recentOrders = periodOrders.slice(0, 5)
  const periodLabel = periodOptions.find((option) => option.value === period)?.label ?? ''

  return <>
    <PageHeader eyebrow="RESUMEN DE OPERACIÓN" title={`Buenos días, ${user?.name.split(' ')[0]}`} description={admin ? 'Información real y consolidada de la operación comercial.' : 'Consulta tu actividad comercial y crea pedidos desde un solo lugar.'} action={<Link className="primary-button" to="/pedidos/nuevo">+ Nuevo pedido</Link>} />
    <section className="dashboard-period" aria-label="Filtro de período"><div><strong>Período</strong><span>Actualiza todos los datos del resumen</span></div><div className="period-selector">{periodOptions.map((option) => <button type="button" key={option.value} className={period === option.value ? 'active' : ''} aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}>{option.label}</button>)}</div></section>
    {(error || dashboardError) && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar el resumen</strong><p>{error || dashboardError}</p></div><button type="button" className="secondary-button" onClick={() => { void refreshOrders(); void refreshDashboardData() }}>Reintentar</button></div>}
    {(loading || dashboardLoading) && <div className="catalog-loading dashboard-loading" role="status"><span /><strong>Cargando información desde Supabase…</strong></div>}
    {admin ? <><section className="stats-grid dashboard-stats">
      <StatCard label="Ventas totales" value={formatCurrency(sales)} detail={`No cancelados · ${periodLabel}`} tone="blue" />
      <StatCard label="Ya cobrado" value={formatCurrency(collected)} detail="Pagos vigentes recibidos" tone="green" />
      <StatCard label="Por cobrar" value={formatCurrency(receivable)} detail="Ventas menos pagos vigentes" tone="amber" />
      <StatCard label="Pedidos activos" value={String(activeOrders)} detail="Con saldo pendiente" tone="slate" />
      <StatCard label="Ganancia empresa" value={formatCurrency(companyProfit)} detail="Después de costos, comisiones y envío" tone="green" />
    </section><section className="financial-strip"><div><span>Comisiones vendedores</span><strong>{formatCurrency(sellerCommissions)}</strong></div><div><span>Comisión administrativa</span><strong>{formatCurrency(adminCommissions)}</strong></div><div><span>Margen neto</span><strong>{margin.toFixed(1)}%</strong></div></section></> :
      <section className="stats-grid"><StatCard label="Mis ventas" value={formatCurrency(sales)} detail={`No cancelados · ${periodLabel}`} tone="blue" /><StatCard label="Mis pedidos" value={String(validOrders.length)} detail="Pedidos no cancelados" tone="amber" /><StatCard label="Clientes atendidos" value={String(new Set(validOrders.map((order) => order.client)).size)} detail="Actividad de tu cartera" tone="green" /><StatCard label="Mis comisiones" value={formatCurrency(sellerCommissions)} detail="Solo tus comisiones" tone="slate" /></section>}
    <section className="panel"><div className="panel-heading"><div><h2>Pedidos recientes</h2><p>Últimos 5 pedidos del período seleccionado</p></div><Link to="/pedidos">Ver todos →</Link></div><div className="table-wrap dashboard-table"><table><thead><tr><th>Pedido</th><th>Cliente</th>{admin && <th>Vendedor</th>}<th>Estado de cobro</th><th>Total</th><th>Cobrado</th><th>Por cobrar</th></tr></thead><tbody>{recentOrders.map((order) => {
      const paid = order.databaseStatus === 'cancelled' ? 0 : amountPaid(order)
      const due = order.databaseStatus === 'cancelled' ? 0 : Math.max(0, order.total - paid)
      const state = order.databaseStatus === 'cancelled' ? 'cancelled' : paid <= 0 ? 'pending' : due <= 0 ? 'paid' : 'partial'
      const label = state === 'cancelled' ? 'Cancelado' : paymentLabels[state]
      const openOrder = () => navigate(`/pedidos/${encodeURIComponent(order.id)}`, { state: { order } })
      return <tr key={order.id} className="clickable-row" tabIndex={0} aria-label={`Abrir detalle del pedido ${order.orderNumber}`} onClick={openOrder} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder() } }}><td><strong>#{order.orderNumber}</strong><small>{order.date}</small></td><td>{order.client}</td>{admin && <td>{sellerNames.get(order.sellerId) ?? (order.sellerId === user?.id ? user.name : 'Vendedor')}</td>}<td><span className={`collection-status ${state}`}>{label}</span></td><td className="money">{formatCurrency(order.total)}</td><td className="money collected-money">{formatCurrency(paid)}</td><td className="money due-money">{formatCurrency(due)}</td></tr>
    })}</tbody></table></div>{!recentOrders.length && <div className="dashboard-empty">No hay pedidos en el período seleccionado.</div>}</section>
  </>
}
