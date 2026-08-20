import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOrders } from '../context/OrdersContext'
import { formatCurrency } from '../data/mockData'
import { supabase } from '../lib/supabase'
import type { Order, OrderCollectionSummary, OrderPayment, PaymentStatus } from '../types'

interface CollectionSummaryRow {
  order_id: string
  sale_total: number
  amount_paid: number
  balance_due: number
  payment_status: PaymentStatus
}

interface OrderPaymentRow {
  id: string
  order_id: string
  amount: number
  payment_date: string
  note: string | null
  recorded_by: string
  created_at: string
  is_voided: boolean
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
}

const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Pago parcial',
  paid: 'Pagado',
}

export function OrderDetailPage() {
  const { id } = useParams()
  const { orders, canViewOrder, updateOrderStatus, updateOrderShipping, loading, error, refreshOrders } = useOrders()
  const { user } = useAuth()
  const isAdministrator = user?.role === 'admin'
  const order = orders.find((item) => item.id === id)
  const [collection, setCollection] = useState<OrderCollectionSummary | null>(null)
  const [payments, setPayments] = useState<OrderPayment[]>([])
  const [collectionLoading, setCollectionLoading] = useState(true)
  const [collectionError, setCollectionError] = useState('')
  const [collectionMessage, setCollectionMessage] = useState('')
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null)

  const refreshCollection = useCallback(async () => {
    if (!id || !user) return
    setCollectionLoading(true)
    setCollectionError('')
    try {
      const summaryResponse = await supabase.rpc('get_order_collection_summary', { p_order_id: id })
      if (summaryResponse.error) throw summaryResponse.error
      const summaryRow = (Array.isArray(summaryResponse.data) ? summaryResponse.data[0] : summaryResponse.data) as CollectionSummaryRow | null
      if (!summaryRow) throw new Error('Supabase no devolvió el resumen de cobro del pedido.')
      setCollection({
        orderId: summaryRow.order_id,
        saleTotal: Number(summaryRow.sale_total),
        amountPaid: Number(summaryRow.amount_paid),
        balanceDue: Number(summaryRow.balance_due),
        paymentStatus: summaryRow.payment_status,
      })

      if (isAdministrator) {
        const paymentsResponse = await supabase
          .from('order_payments')
          .select('id, order_id, amount, payment_date, note, recorded_by, created_at, is_voided, voided_at, voided_by, void_reason')
          .eq('order_id', id)
          .order('payment_date', { ascending: false })
          .order('created_at', { ascending: false })
        if (paymentsResponse.error) throw paymentsResponse.error
        setPayments(((paymentsResponse.data ?? []) as OrderPaymentRow[]).map((payment) => ({
          id: payment.id,
          orderId: payment.order_id,
          amount: Number(payment.amount),
          paymentDate: payment.payment_date,
          note: payment.note ?? undefined,
          recordedBy: payment.recorded_by,
          createdAt: payment.created_at,
          isVoided: payment.is_voided,
          voidedAt: payment.voided_at ?? undefined,
          voidedBy: payment.voided_by ?? undefined,
          voidReason: payment.void_reason ?? undefined,
        })))
      } else {
        setPayments([])
      }
    } catch (cause) {
      setCollectionError(readableCollectionError(cause))
    } finally {
      setCollectionLoading(false)
    }
  }, [id, isAdministrator, user])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshCollection(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshCollection])

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

  const registerPayment = async (amount: number, paymentDate: string, note: string) => {
    if (!isAdministrator) throw new Error('Solo un administrador puede registrar pagos.')
    setCollectionError('')
    setCollectionMessage('')
    const response = await supabase.rpc('register_order_payment', {
      p_order_id: order.id,
      p_amount: amount,
      p_payment_date: paymentDate,
      p_note: note.trim() || null,
    })
    if (response.error) throw new Error(readableCollectionError(response.error))
    await refreshOrders()
    await refreshCollection()
    setShowPaymentForm(false)
    setCollectionMessage('Pago registrado correctamente.')
  }

  const voidPayment = async (payment: OrderPayment) => {
    if (!isAdministrator || payment.isVoided) return
    const reason = window.prompt('Indica el motivo obligatorio de la anulación:')
    if (reason === null) return
    if (!reason.trim()) { window.alert('Debes indicar el motivo de la anulación.'); return }
    setVoidingPaymentId(payment.id)
    setCollectionError('')
    setCollectionMessage('')
    try {
      const response = await supabase.rpc('void_order_payment', {
        p_payment_id: payment.id,
        p_void_reason: reason.trim(),
      })
      if (response.error) throw response.error
      await refreshOrders()
      await refreshCollection()
      setCollectionMessage('Pago anulado correctamente. El historial fue conservado.')
    } catch (cause) {
      setCollectionError(readableCollectionError(cause))
    } finally {
      setVoidingPaymentId(null)
    }
  }

  return <>
    <div className="detail-top"><Link className="secondary-button" to="/pedidos">← Volver a pedidos</Link><span>Detalle de operación</span></div>
    <header className="order-detail-hero"><div><span className="eyebrow">PEDIDO TOM-ELECTRIC</span><div className="detail-title"><h1>#{order.orderNumber}</h1><span className={`status ${order.databaseStatus}`}>{order.status}</span></div><p>Creado el {order.date} por <strong>{order.seller}</strong></p>{isAdministrator && (order.databaseStatus === 'new' || order.databaseStatus === 'cancelled') && <button type="button" className="detail-status-action" onClick={() => void changeStatus()}>{order.databaseStatus === 'new' ? 'Cancelar pedido' : 'Devolver a pendiente'}</button>}</div><div className="detail-total"><span>Total de la venta</span><strong>{formatCurrency(order.total)}</strong></div></header>
    <div className="detail-layout"><div className="detail-main">
      <section className="detail-panel"><div className="detail-panel-title"><span>01</span><div><h2>Datos del cliente</h2><p>Información comercial almacenada en Supabase.</p></div></div><div className="client-details"><DetailItem label="Cliente" value={order.client} /><DetailItem label="Teléfono" value={order.phone || 'No registrado'} /><DetailItem label="Correo" value={order.email || 'No registrado'} /><DetailItem label="Ciudad" value={order.city || 'No registrada'} /><DetailItem label="Dirección" value={order.address || 'No registrada'} /><DetailItem label="Método de pago" value={paymentLabel(order.paymentMethod)} /></div></section>
      <section className="detail-panel"><div className="detail-panel-title"><span>02</span><div><h2>Productos del pedido</h2><p>{order.items} unidades incluidas en esta operación.</p></div></div>
        <div className="detail-products"><div className="detail-product-head"><span>Producto</span><span>Cantidad</span><span>Precio unitario</span><span>Subtotal</span></div>{order.products?.map((product, index) => <article className="detail-product" key={`${product.productId}-${index}`}><div className="detail-product-name"><span>{product.productName[0]}</span><div><strong>{product.productName}</strong><small>{product.productCode}</small></div></div><div><small>Cantidad</small><strong>{product.quantity}</strong></div><div><small>Precio unitario</small><strong>{formatCurrency(product.unitPrice)}</strong></div><div><small>Subtotal</small><strong>{formatCurrency(product.quantity * product.unitPrice)}</strong></div></article>)}</div>
      </section>
      <CollectionSection
        collection={collection}
        payments={payments}
        loading={collectionLoading}
        error={collectionError}
        message={collectionMessage}
        isAdministrator={isAdministrator}
        isCancelled={order.databaseStatus === 'cancelled'}
        voidingPaymentId={voidingPaymentId}
        currentUserId={user?.id}
        currentUserName={user?.name}
        onRetry={refreshCollection}
        onRegister={() => setShowPaymentForm(true)}
        onVoid={voidPayment}
      />
      {order.notes && <section className="detail-panel"><div className="detail-panel-title"><span>04</span><div><h2>Notas</h2><p>{order.notes}</p></div></div></section>}
    </div><aside className="detail-summary"><div className="detail-panel-title"><span>05</span><div><h2>Resumen del pedido</h2><p>Valores confirmados por Supabase.</p></div></div><div className="detail-summary-row"><span>Subtotal de artículos</span><strong>{formatCurrency(productSubtotal)}</strong></div><div className="detail-grand-total"><span>Total de la venta</span><strong>{formatCurrency(order.total)}</strong></div>
      {user?.role === 'seller' && <div className="my-commission-card"><span>Mi comisión real</span><strong>{formatCurrency(order.sellerCommission)}</strong><small>Valor devuelto por get_my_order_commissions()</small></div>}
      {isAdministrator && <><AdminShippingCard order={order} onSave={(cost) => updateOrderShipping(order.id, cost, user)} /><div className="detail-internal"><span className="internal-tag">SOLO ADMINISTRADOR</span><h3>Información financiera interna</h3><div><span>Costo total de productos</span><strong>{formatCurrency(order.cost)}</strong></div><div><span>Comisión del vendedor</span><strong>{formatCurrency(order.sellerCommission)}</strong></div><div><span>Comisión administrativa</span><strong>{formatCurrency(order.adminCommission)}</strong></div><div><span>Costo real del envío</span><strong>{formatCurrency(order.shippingCost)}</strong></div><div className="detail-profit"><span>Utilidad de la empresa</span><strong>{formatCurrency(order.companyProfit)}</strong></div></div></>}
    </aside></div>
    {showPaymentForm && collection && <RegisterPaymentModal balanceDue={collection.balanceDue} onClose={() => setShowPaymentForm(false)} onSubmit={registerPayment} />}
  </>
}

function CollectionSection({ collection, payments, loading, error, message, isAdministrator, isCancelled, voidingPaymentId, currentUserId, currentUserName, onRetry, onRegister, onVoid }: {
  collection: OrderCollectionSummary | null
  payments: OrderPayment[]
  loading: boolean
  error: string
  message: string
  isAdministrator: boolean
  isCancelled: boolean
  voidingPaymentId: string | null
  currentUserId?: string
  currentUserName?: string
  onRetry: () => Promise<void>
  onRegister: () => void
  onVoid: (payment: OrderPayment) => Promise<void>
}) {
  return <section className="detail-panel collection-panel">
    <div className="detail-panel-title"><span>03</span><div><h2>Estado de cobro</h2><p>Saldo calculado con pagos reales registrados en Supabase.</p></div></div>
    {loading && !collection ? <div className="collection-loading" role="status">Cargando estado de cobro…</div> : error && !collection ? <div className="collection-error" role="alert"><span>{error}</span><button type="button" className="secondary-button" onClick={() => void onRetry()}>Reintentar</button></div> : collection && <>
      <div className="collection-summary-grid">
        <article><span>Total del pedido</span><strong>{formatCurrency(collection.saleTotal)}</strong></article>
        <article><span>Ya cobrado</span><strong>{formatCurrency(collection.amountPaid)}</strong></article>
        <article><span>Por cobrar</span><strong>{formatCurrency(collection.balanceDue)}</strong></article>
        <article><span>Estado de pago</span><strong className={`collection-status ${collection.paymentStatus}`}>{paymentStatusLabels[collection.paymentStatus]}</strong></article>
      </div>
      {error && <p className="collection-feedback error" role="alert">{error}</p>}
      {message && <p className="collection-feedback success" role="status">{message}</p>}
      {isAdministrator && <div className="collection-admin-actions"><button type="button" className="primary-button" onClick={onRegister} disabled={isCancelled || collection.balanceDue <= 0}>+ Registrar pago</button>{isCancelled && <small>Los pedidos cancelados no aceptan nuevos pagos.</small>}{!isCancelled && collection.balanceDue <= 0 && <small>El pedido ya se encuentra pagado.</small>}</div>}
      {isAdministrator && <div className="payment-history"><div className="payment-history-title"><div><h3>Historial de pagos</h3><p>Los pagos anulados permanecen visibles para auditoría.</p></div><span>{payments.length} registro{payments.length === 1 ? '' : 's'}</span></div>
        {!payments.length ? <div className="empty-payment-history">Todavía no hay pagos registrados.</div> : payments.map((payment) => <article className={`payment-record ${payment.isVoided ? 'voided' : ''}`} key={payment.id}>
          <div className="payment-record-main"><div><strong>{formatCurrency(payment.amount)}</strong><span>{formatPaymentDate(payment.paymentDate)}</span></div><span className={`payment-record-status ${payment.isVoided ? 'voided' : 'active'}`}>{payment.isVoided ? 'Anulado' : 'Vigente'}</span></div>
          <div className="payment-record-meta"><span>Registrado por <strong>{payment.recordedBy === currentUserId ? currentUserName : payment.recordedBy}</strong></span><span>{formatDateTime(payment.createdAt)}</span></div>
          {payment.note && <p className="payment-note">{payment.note}</p>}
          {payment.isVoided ? <div className="payment-void-reason"><strong>Motivo de anulación</strong><span>{payment.voidReason}</span></div> : <button type="button" className="void-payment-button" disabled={voidingPaymentId === payment.id} onClick={() => void onVoid(payment)}>{voidingPaymentId === payment.id ? 'Anulando…' : 'Anular pago'}</button>}
        </article>)}
      </div>}
    </>}
  </section>
}

function RegisterPaymentModal({ balanceDue, onClose, onSubmit }: { balanceDue: number; onClose: () => void; onSubmit: (amount: number, paymentDate: string, note: string) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(todayInBogota())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('El valor recibido debe ser mayor que cero.'); return }
    if (numericAmount > balanceDue) { setError('El valor recibido no puede superar el saldo pendiente.'); return }
    if (!paymentDate || paymentDate > todayInBogota()) { setError('La fecha del pago no puede ser futura.'); return }
    setSaving(true); setError('')
    try { await onSubmit(numericAmount, paymentDate, note) }
    catch (cause) { setError(readableCollectionError(cause)) }
    finally { setSaving(false) }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-modal-title"><header className="import-header"><div><h2 id="payment-modal-title">Registrar pago</h2><p>Saldo pendiente: {formatCurrency(balanceDue)}</p></div><button type="button" aria-label="Cerrar" onClick={onClose} disabled={saving}>×</button></header><form onSubmit={submit}><div className="payment-form-grid"><label className="field"><span>Valor recibido</span><input type="number" min="0.01" max={balanceDue} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" autoFocus /></label><label className="field"><span>Fecha del pago</span><input type="date" max={todayInBogota()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label className="field wide"><span>Nota opcional</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Referencia o detalle del abono" /></label></div>{error && <p className="payment-form-error" role="alert">{error}</p>}<footer className="import-actions"><div><strong>Registro seguro</strong><span>Supabase valida el saldo y evita sobrepagos.</span></div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Registrar pago'}</button></footer></form></section></div>
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

function readableCollectionError(cause: unknown) {
  if (cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string') return cause.message
  return 'No fue posible completar la operación de cobro.'
}
function todayInBogota() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
function formatPaymentDate(value: string) { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(new Date(value)) }
function DetailItem({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
function paymentLabel(method: Order['paymentMethod']) { return { cash_sale: 'Contra entrega', bank_transfer: 'Transferencia bancaria', cash: 'Efectivo', credit: 'Crédito' }[method] }
function DetailState({ code, title, message, action }: { code: string; title: string; message: string; action?: () => void }) { return <section className="detail-state"><span>{code}</span><h1>{title}</h1><p>{message}</p>{action ? <button className="primary-button" onClick={action}>Reintentar</button> : <Link className="primary-button" to="/pedidos">Volver a pedidos</Link>}</section> }
