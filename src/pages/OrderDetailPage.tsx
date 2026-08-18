import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { formatCurrency } from '../data/mockData'
import type { Order } from '../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const { orders, canViewOrder, updateOrderStatus, updateOrderShipping, loading, error, refreshOrders } = useOrders()
  const { user } = useAuth()
  const isAdministrator = user?.role === 'admin'
  const order = orders.find((item) => item.id === id)

  if (loading) return <section className="catalog-loading" role="status"><span /><strong>Cargando detalle desde Supabase…</strong></section>
  if (error) return <DetailState code="!" title="No fue posible cargar el pedido" message={error} action={() => void refreshOrders()} />
  if (!order) return <DetailState code="404" title="Pedido no encontrado" message="El pedido solicitado no existe o no está permitido para tu perfil." />
  if (!canViewOrder(order, user)) return <DetailState code="403" title="Pedido restringido" message="Solo puedes consultar los pedidos autorizados para tu perfil." />

  const productSubtotal = order.products?.reduce((sum, product) => sum + product.quantity * product.unitPrice, 0) ?? order.total
  const changeStatus = async () => {
    if (order.databaseStatus !== 'new' && order.databaseStatus !== 'cancelled') return
    const nextStatus = order.databaseStatus === 'new' ? 'cancelled' : 'new'
    const nextLabel = nextStatus === 'new' ? 'Pendiente' : 'Cancelado'
    if (!window.confirm(`¿Confirmas cambiar el pedido #${order.orderNumber} de ${order.status} a ${nextLabel}?`)) return
    try { await updateOrderStatus(order.id, nextStatus, user) }
    catch (cause) { window.alert(cause instanceof Error ? cause.message : 'No fue posible cambiar el estado.') }
  }

  return <>
    <div className="detail-top"><Link className="secondary-button" to="/pedidos">← Volver a pedidos</Link><span>Detalle de operación</span></div>
    <header className="order-detail-hero"><div><span className="eyebrow">PEDIDO TOM-ELECTRIC</span><div className="detail-title"><h1>#{order.orderNumber}</h1><span className={`status ${order.databaseStatus}`}>{order.status}</span></div><p>Creado el {order.date} por <strong>{order.seller}</strong></p>{isAdministrator && (order.databaseStatus === 'new' || order.databaseStatus === 'cancelled') && <button type="button" className="detail-status-action" onClick={() => void changeStatus()}>{order.databaseStatus === 'new' ? 'Cancelar pedido' : 'Devolver a pendiente'}</button>}</div><div className="detail-total"><span>Total de la venta</span><strong>{formatCurrency(order.total)}</strong></div></header>
    <div className="detail-layout"><div className="detail-main">
      <section className="detail-panel"><div className="detail-panel-title"><span>01</span><div><h2>Datos del cliente</h2><p>Información comercial almacenada en Supabase.</p></div></div><div className="client-details"><DetailItem label="Cliente" value={order.client} /><DetailItem label="Teléfono" value={order.phone || 'No registrado'} /><DetailItem label="Correo" value={order.email || 'No registrado'} /><DetailItem label="Ciudad" value={order.city || 'No registrada'} /><DetailItem label="Dirección" value={order.address || 'No registrada'} /><DetailItem label="Método de pago" value={paymentLabel(order.paymentMethod)} /></div></section>
      <section className="detail-panel"><div className="detail-panel-title"><span>02</span><div><h2>Productos del pedido</h2><p>{order.items} unidades incluidas en esta operación.</p></div></div>
        <div className="detail-products"><div className="detail-product-head"><span>Producto</span><span>Cantidad</span><span>Precio unitario</span><span>Subtotal</span></div>{order.products?.map((product, index) => <article className="detail-product" key={`${product.productId}-${index}`}><div className="detail-product-name"><span>{product.productName[0]}</span><div><strong>{product.productName}</strong><small>{product.productCode}</small></div></div><div><small>Cantidad</small><strong>{product.quantity}</strong></div><div><small>Precio unitario</small><strong>{formatCurrency(product.unitPrice)}</strong></div><div><small>Subtotal</small><strong>{formatCurrency(product.quantity * product.unitPrice)}</strong></div></article>)}</div>
      </section>
      {order.notes && <section className="detail-panel"><div className="detail-panel-title"><span>03</span><div><h2>Notas</h2><p>{order.notes}</p></div></div></section>}
    </div><aside className="detail-summary"><div className="detail-panel-title"><span>04</span><div><h2>Resumen del pedido</h2><p>Valores confirmados por Supabase.</p></div></div><div className="detail-summary-row"><span>Subtotal de artículos</span><strong>{formatCurrency(productSubtotal)}</strong></div><div className="detail-grand-total"><span>Total de la venta</span><strong>{formatCurrency(order.total)}</strong></div>
      {user?.role === 'seller' && <div className="my-commission-card"><span>Mi comisión real</span><strong>{formatCurrency(order.sellerCommission)}</strong><small>Valor devuelto por get_my_order_commissions()</small></div>}
      {isAdministrator && <><AdminShippingCard order={order} onSave={(cost) => updateOrderShipping(order.id, cost, user)} /><div className="detail-internal"><span className="internal-tag">SOLO ADMINISTRADOR</span><h3>Información financiera interna</h3><div><span>Costo total de productos</span><strong>{formatCurrency(order.cost)}</strong></div><div><span>Comisión del vendedor</span><strong>{formatCurrency(order.sellerCommission)}</strong></div><div><span>Comisión administrativa</span><strong>{formatCurrency(order.adminCommission)}</strong></div><div><span>Costo real del envío</span><strong>{formatCurrency(order.shippingCost)}</strong></div><div className="detail-profit"><span>Utilidad de la empresa</span><strong>{formatCurrency(order.companyProfit)}</strong></div></div></>}
    </aside></div>
  </>
}

function AdminShippingCard({ order, onSave }: { order: Order; onSave: (cost: number) => Promise<void> }) {
  const [cost, setCost] = useState(order.shippingCost)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const recommended = order.total * 0.05
  const exceeds = cost > recommended
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try { await onSave(cost); setMessage('Costo de envío actualizado correctamente.') }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'No fue posible actualizar el envío.') }
    finally { setSaving(false) }
  }
  return <form className="admin-shipping-card" onSubmit={submit}><span className="internal-tag">GESTIÓN DE ENVÍO</span><div><span>Máximo recomendado (5%)</span><strong>{formatCurrency(recommended)}</strong></div><label><span>Costo real del envío</span><input type="number" min="0" step="1" value={cost} onChange={(event) => setCost(Math.max(0, Number(event.target.value)))} /></label>{exceeds && <p className="shipping-warning">⚠ Supera el máximo recomendado. Puedes guardarlo de todas formas.</p>}{message && <p className="shipping-message">{message}</p>}<button type="submit" className="secondary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar envío'}</button></form>
}

function DetailItem({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function paymentLabel(method: Order['paymentMethod']) { return { cash_sale: 'Contra entrega', bank_transfer: 'Transferencia bancaria', cash: 'Efectivo', credit: 'Crédito' }[method] }
function DetailState({ code, title, message, action }: { code: string; title: string; message: string; action?: () => void }) { return <section className="detail-state"><span>{code}</span><h1>{title}</h1><p>{message}</p>{action ? <button className="primary-button" onClick={action}>Reintentar</button> : <Link className="primary-button" to="/pedidos">Volver a pedidos</Link>}</section> }
