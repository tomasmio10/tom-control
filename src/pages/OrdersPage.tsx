import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { formatCurrency } from '../data/mockData'
import type { Order } from '../types'

export function OrdersPage() {
  const { getOrdersForUser, updateOrderStatus, loading, error, refreshOrders } = useOrders()
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()
  const admin = user?.role === 'admin'
  const [query, setQuery] = useState('')
  const allowedOrders = getOrdersForUser(user)
  const visible = useMemo(
    () => allowedOrders.filter((order) => `${order.id} ${order.client} ${order.status}`.toLowerCase().includes(query.toLowerCase())),
    [allowedOrders, query],
  )

  const changeStatus = async (order: Order) => {
    const nextStatus = order.databaseStatus === 'new' ? 'cancelled' : 'new'
    const nextLabel = nextStatus === 'new' ? 'Pendiente' : 'Cancelado'
    const confirmed = window.confirm(`¿Confirmas cambiar el pedido ${order.orderNumber} de ${order.status} a ${nextLabel}?`)
    if (confirmed) { try { await updateOrderStatus(order.id, nextStatus, user) } catch (cause) { window.alert(cause instanceof Error ? cause.message : 'No fue posible cambiar el estado.') } }
  }

  return <>
    {location.state?.createdId && <div className="success-banner" role="status"><span>✓</span><div><strong>Pedido #{location.state.createdId} creado correctamente</strong><small>Fue guardado de forma transaccional en Supabase.</small></div></div>}
    <PageHeader eyebrow="OPERACIÓN COMERCIAL" title="Pedidos" description={admin ? 'Consulta todos los pedidos y su rentabilidad.' : 'Crea pedidos y consulta únicamente tu actividad comercial.'} action={<Link className="primary-button" to="/pedidos/nuevo">+ Crear pedido</Link>} />
    {error && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible cargar los pedidos</strong><p>{error}</p></div><button type="button" className="secondary-button" onClick={() => void refreshOrders()}>Reintentar</button></div>}
    <section className="panel">
      <div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pedido o cliente..." /></label><button className="secondary-button">Filtrar</button></div>
      {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando pedidos desde Supabase…</strong></div> : <div className="table-wrap"><table><thead><tr><th>Pedido / fecha</th><th>Cliente / dirección</th>{admin && <th>Vendedor</th>}<th>Productos</th><th>Estado</th>{admin && <><th>Costo</th><th>Comisiones</th><th>Ganancia</th></>}{!admin && <th>Mi comisión</th>}<th>Total</th></tr></thead>
        <tbody>{visible.map((order) => {
          const openOrder = () => navigate(`/pedidos/${encodeURIComponent(order.id)}`, { state: { order } })
          return <tr key={order.id} className="clickable-row" tabIndex={0} aria-label={`Abrir detalle del pedido ${order.id}`} onClick={openOrder} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOrder() } }}>
            <td><strong>#{order.orderNumber}</strong><small>{order.date}</small></td>
            <td><strong>{order.client}</strong><small>{order.address}</small></td>
            {admin && <td>{order.seller}</td>}
            <td>{order.items} unidades</td>
            <td><div className="order-status-cell"><span className={`status ${order.databaseStatus}`}>{order.status}</span>{admin && (order.databaseStatus === 'new' || order.databaseStatus === 'cancelled') && <button type="button" className={`status-action ${order.databaseStatus}`} onClick={(event) => { event.stopPropagation(); void changeStatus(order) }}>{order.databaseStatus === 'new' ? 'Cancelar' : 'Reactivar'}</button>}</div></td>
            {admin && <><td>{formatCurrency(order.cost)}</td><td><small>Vend. {formatCurrency(order.sellerCommission)}</small><small>Adm. {formatCurrency(order.adminCommission)}</small></td><td className="profit">{formatCurrency(order.total - order.cost - order.sellerCommission - order.adminCommission)}</td></>}
            {!admin && <td className="seller-commission"><strong>{formatCurrency(order.sellerCommission)}</strong><small>Valor calculado en Supabase</small></td>}
            <td className="money">{formatCurrency(order.total)}</td>
          </tr>
        })}</tbody>
      </table>{!visible.length && !error && <div className="empty-state">No hay pedidos disponibles.</div>}</div>}
      <div className="table-footer">Mostrando {visible.length} de {visible.length} pedidos <span>Selecciona una fila para ver el detalle</span></div>
    </section>
  </>
}
