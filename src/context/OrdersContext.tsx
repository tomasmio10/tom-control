import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { useAuth } from './AuthContext'
import { useProducts } from './ProductsContext'
import { supabase } from '../lib/supabase'
import type { CreateOrderInput, DatabaseOrderStatus, Order, OrderLine, OrderStatus, SessionUser } from '../types'

interface OrderRow {
  id: string
  order_number: number
  seller_id: string
  customer_name: string
  customer_city: string
  customer_phone: string | null
  customer_email: string | null
  customer_address: string | null
  notes: string | null
  payment_method: Order['paymentMethod']
  sale_total: number
  status: DatabaseOrderStatus
  payment_status: Order['paymentStatus']
  created_at: string
}

interface OrderItemRow { id: string; order_id: string; product_id: string; quantity: number; subtotal: number }
interface FinancialRow { order_id: string; product_cost_total: number; seller_commission_amount: number; admin_commission_amount: number; shipping_cost: number; company_profit: number }
interface CommissionRow { order_id: string; seller_commission_amount: number }
interface CreateOrderRow { order_id: string; order_number: number; created_at: string; sale_total: number; status: DatabaseOrderStatus; payment_status: Order['paymentStatus'] }

interface OrdersContextValue {
  orders: Order[]
  loading: boolean
  error: string | null
  refreshOrders: () => Promise<void>
  createOrder: (input: CreateOrderInput) => Promise<CreateOrderRow>
  updateOrderStatus: (orderId: string, status: 'new' | 'cancelled', user: SessionUser | null) => Promise<boolean>
  updateOrderShipping: (orderId: string, shippingCost: number, user: SessionUser | null) => Promise<void>
  getOrdersForUser: (user: SessionUser | null) => Order[]
  canViewOrder: (order: Order, user: SessionUser | null) => boolean
}

const OrdersContext = createContext<OrdersContextValue | null>(null)

const statusLabels: Record<DatabaseOrderStatus, OrderStatus> = {
  new: 'Pendiente', preparing: 'Preparando', shipped: 'Enviado', delivered: 'Entregado', cancelled: 'Cancelado',
}

function readableOrderError(error: PostgrestError | null) {
  if (!error) return null
  if (error.code === '42501') return 'Tu perfil no tiene permisos para realizar esta operación.'
  if (/failed to fetch|network/i.test(error.message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return error.message || 'No fue posible completar la operación con el pedido.'
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { products } = useProducts()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshOrders = useCallback(async () => {
    if (!user) { setOrders([]); setError(null); return }
    setLoading(true); setError(null)
    const orderResponse = await supabase.from('orders').select('id, order_number, seller_id, customer_name, customer_city, customer_phone, customer_email, customer_address, notes, payment_method, sale_total, status, payment_status, created_at').order('created_at', { ascending: false })
    if (orderResponse.error) { setOrders([]); setError(readableOrderError(orderResponse.error)); setLoading(false); return }
    const orderRows = (orderResponse.data ?? []) as OrderRow[]
    const orderIds = orderRows.map((order) => order.id)
    let itemRows: OrderItemRow[] = []
    if (orderIds.length) {
      const itemResponse = await supabase.from('order_items').select('id, order_id, product_id, quantity, subtotal').in('order_id', orderIds).order('created_at')
      if (itemResponse.error) { setOrders([]); setError(readableOrderError(itemResponse.error)); setLoading(false); return }
      itemRows = (itemResponse.data ?? []) as OrderItemRow[]
    }

    let financials = new Map<string, FinancialRow>()
    let commissions = new Map<string, number>()
    if (user.role === 'admin' && orderIds.length) {
      const financialResponse = await supabase.from('order_financials').select('order_id, product_cost_total, seller_commission_amount, admin_commission_amount, shipping_cost, company_profit').in('order_id', orderIds)
      if (financialResponse.error) { setOrders([]); setError(readableOrderError(financialResponse.error)); setLoading(false); return }
      financials = new Map(((financialResponse.data ?? []) as FinancialRow[]).map((row) => [row.order_id, row]))
    } else if (user.role === 'seller') {
      const commissionResponse = await supabase.rpc('get_my_order_commissions')
      if (commissionResponse.error) { setOrders([]); setError(readableOrderError(commissionResponse.error)); setLoading(false); return }
      commissions = new Map(((commissionResponse.data ?? []) as CommissionRow[]).map((row) => [row.order_id, Number(row.seller_commission_amount)]))
    }

    const productMap = new Map(products.map((product) => [product.id, product]))
    const linesByOrder = new Map<string, OrderLine[]>()
    itemRows.forEach((item) => {
      const product = productMap.get(item.product_id)
      const quantity = Number(item.quantity)
      const subtotal = Number(item.subtotal)
      const line: OrderLine = { productId: item.product_id, productCode: product?.sku ?? item.product_id, productName: product?.name ?? 'Producto del catálogo', quantity, unitPrice: quantity ? subtotal / quantity : 0, unitCost: 0 }
      linesByOrder.set(item.order_id, [...(linesByOrder.get(item.order_id) ?? []), line])
    })

    setOrders(orderRows.map((row) => {
      const lines = linesByOrder.get(row.id) ?? []
      const financial = financials.get(row.id)
      return {
        id: row.id, orderNumber: String(row.order_number), date: new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(row.created_at)),
        client: row.customer_name, address: row.customer_address ?? '', city: row.customer_city, phone: row.customer_phone ?? undefined, email: row.customer_email ?? undefined, notes: row.notes ?? undefined,
        paymentMethod: row.payment_method, paymentStatus: row.payment_status, sellerId: row.seller_id, seller: row.seller_id === user.id ? user.name : row.seller_id,
        items: lines.reduce((sum, line) => sum + line.quantity, 0), products: lines, total: Number(row.sale_total), cost: Number(financial?.product_cost_total ?? 0),
        sellerCommission: Number(financial?.seller_commission_amount ?? commissions.get(row.id) ?? 0), adminCommission: Number(financial?.admin_commission_amount ?? 0), shippingCost: Number(financial?.shipping_cost ?? 0), companyProfit: Number(financial?.company_profit ?? 0),
        status: statusLabels[row.status], databaseStatus: row.status,
      }
    }))
    setLoading(false)
  }, [products, user])

  useEffect(() => { const timer = window.setTimeout(() => void refreshOrders(), 0); return () => window.clearTimeout(timer) }, [refreshOrders])

  const createOrder = useCallback(async (input: CreateOrderInput) => {
    if (!user) throw new Error('Se requiere una sesión autenticada para crear pedidos.')
    const { data, error: rpcError } = await supabase.rpc('create_order', {
      p_customer_name: input.customerName.trim(), p_customer_city: input.customerCity.trim(), p_payment_method: input.paymentMethod,
      p_items: input.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
      p_customer_phone: input.customerPhone?.trim() || null, p_customer_email: input.customerEmail?.trim() || null,
      p_customer_address: input.customerAddress?.trim() || null, p_notes: input.notes?.trim() || null,
    })
    if (rpcError) throw new Error(readableOrderError(rpcError) ?? 'No fue posible crear el pedido.')
    const created = (Array.isArray(data) ? data[0] : data) as CreateOrderRow | null
    if (!created) throw new Error('Supabase no devolvió la información del pedido creado.')
    await refreshOrders(); return created
  }, [refreshOrders, user])

  const updateOrderStatus = useCallback(async (orderId: string, status: 'new' | 'cancelled', actor: SessionUser | null) => {
    if (actor?.role !== 'admin') return false
    const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (updateError) throw new Error(readableOrderError(updateError) ?? 'No fue posible cambiar el estado.')
    await refreshOrders(); return true
  }, [refreshOrders])

  const updateOrderShipping = useCallback(async (orderId: string, shippingCost: number, actor: SessionUser | null) => {
    if (actor?.role !== 'admin') throw new Error('Solo un administrador puede modificar el envío.')
    const { error: rpcError } = await supabase.rpc('update_order_shipping', { p_order_id: orderId, p_shipping_cost: shippingCost })
    if (rpcError) throw new Error(readableOrderError(rpcError) ?? 'No fue posible actualizar el envío.')
    await refreshOrders()
  }, [refreshOrders])

  const value = useMemo(() => ({
    orders, loading, error, refreshOrders, createOrder, updateOrderStatus, updateOrderShipping,
    getOrdersForUser: (actor: SessionUser | null) => actor?.role === 'seller' ? orders.filter((order) => order.sellerId === actor.id) : actor?.role === 'admin' ? orders : [],
    canViewOrder: (order: Order, actor: SessionUser | null) => actor?.role === 'admin' || (actor?.role === 'seller' && order.sellerId === actor.id),
  }), [orders, loading, error, refreshOrders, createOrder, updateOrderStatus, updateOrderShipping])
  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) throw new Error('useOrders debe usarse dentro de OrdersProvider')
  return context
}
