import { formatCurrency } from '../data/mockData'
import { useOrders } from '../context/OrdersContext'
import { useAuth } from '../context/AuthContext'
import { PageHeader } from '../components/ui/PageHeader'
import { StatCard } from '../components/ui/StatCard'
import { Link, useNavigate } from 'react-router-dom'

export function DashboardPage() {
  const navigate = useNavigate()
  const { getOrdersForUser, loading, error, refreshOrders } = useOrders()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const visibleOrders = getOrdersForUser(user)
  const sales = visibleOrders.reduce((sum, order) => sum + order.total, 0)
  const costs = visibleOrders.reduce((sum, order) => sum + order.cost, 0)
  const commissions = visibleOrders.reduce((sum, order) => sum + order.sellerCommission + order.adminCommission, 0)
  const profit = sales - costs - commissions
  const sellerAccumulatedCommission = visibleOrders.reduce((sum, order) => sum + order.sellerCommission, 0)
  return (
    <>
      <PageHeader eyebrow="RESUMEN DE OPERACIÓN" title={`Buenos días, ${user?.name.split(' ')[0]}`} description={admin ? 'Así se mueve TOM-ELECTRIC hoy. Datos consolidados del equipo comercial.' : 'Consulta tu actividad comercial y crea pedidos desde un solo lugar.'} action={<Link className="primary-button" to="/pedidos/nuevo">+ Nuevo pedido</Link>} />
      {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar el resumen</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refreshOrders()}>Reintentar</button></div>}
      {loading && <div className="catalog-loading" role="status"><span /><strong>Cargando información desde Supabase…</strong></div>}
      <section className="stats-grid">
        <StatCard label={admin ? 'Ventas totales' : 'Mis ventas'} value={formatCurrency(sales)} detail="↑ 12,4% frente al periodo anterior" tone="blue" />
        <StatCard label={admin ? 'Pedidos activos' : 'Mis pedidos'} value={String(visibleOrders.length)} detail={`${visibleOrders.filter((o) => o.status === 'Pendiente').length} pendientes por confirmar`} tone="amber" />
        {admin ? <><StatCard label="Costos de producto" value={formatCurrency(costs)} detail="65,8% sobre las ventas" tone="slate" /><StatCard label="Ganancia empresa" value={formatCurrency(profit)} detail="Resultado después de comisiones" tone="green" /></> : <><StatCard label="Clientes atendidos" value={String(new Set(visibleOrders.map((o) => o.client)).size)} detail="Actividad de tu cartera actual" tone="green" /><StatCard label="Comisiones acumuladas" value={formatCurrency(sellerAccumulatedCommission)} detail="8% de todos tus pedidos visibles" tone="slate" /></>}
      </section>
      {admin && <section className="financial-strip"><div><span>Comisión vendedores</span><strong>{formatCurrency(visibleOrders.reduce((s, o) => s + o.sellerCommission, 0))}</strong></div><div><span>Comisión administrativa</span><strong>{formatCurrency(visibleOrders.reduce((s, o) => s + o.adminCommission, 0))}</strong></div><div><span>Margen neto estimado</span><strong>{sales ? `${((profit / sales) * 100).toFixed(1)}%` : '0%'}</strong></div></section>}
      <section className="panel"><div className="panel-heading"><div><h2>Pedidos recientes</h2><p>Últimos movimientos de la operación comercial</p></div><Link to="/pedidos">Ver todos →</Link></div><div className="table-wrap"><table><thead><tr><th>Pedido</th><th>Cliente</th>{admin && <th>Vendedor</th>}<th>Estado</th><th>Total</th></tr></thead><tbody>{visibleOrders.slice(0, 4).map((order) => { const openOrder = () => navigate(`/pedidos/${encodeURIComponent(order.id)}`, { state: { order } }); return <tr key={order.id} className="clickable-row" tabIndex={0} aria-label={`Abrir detalle del pedido ${order.orderNumber}`} onClick={openOrder} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder() } }}><td><strong>#{order.orderNumber}</strong><small>{order.date}</small></td><td>{order.client}</td>{admin && <td>{order.seller}</td>}<td><span className={`status ${order.databaseStatus}`}>{order.status}</span></td><td className="money">{formatCurrency(order.total)}</td></tr> })}</tbody></table></div></section>
    </>
  )
}
