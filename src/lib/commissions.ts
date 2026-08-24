import { supabase } from './supabase'
import type { SellerCommissionDetail, SellerCommissionSummary } from '../types'

interface SummaryRow {
  seller_id: string
  full_name: string
  valid_sales: number | string
  payable_commission: number | string
  cancelled_commission: number | string
  paid_commission: number | string
  overpaid_commission: number | string
  pending_commission: number | string
}

interface DetailRow {
  summary: SummaryRow
  sales: Array<{ order_id: string; order_number: number; created_at: string; status: SellerCommissionDetail['sales'][number]['status']; sale_total: number | string; amount_paid: number | string; seller_commission_amount: number | string; generated_commission_amount: number | string; remaining_commission_amount: number | string; is_payable: boolean }>
  payments: Array<{ id: string; amount: number | string; payment_date: string; note: string | null; recorded_by: string; created_at: string }>
}

export async function getCommissionSummary() {
  const { data, error } = await supabase.rpc('get_seller_commission_summary')
  if (error) throw new Error(readableCommissionError(error.message, error.code))
  return ((data ?? []) as SummaryRow[]).map(mapSummary)
}

export async function getCommissionPaymentsThisMonth() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const toDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  const { data, error } = await supabase
    .from('seller_commission_payments')
    .select('amount')
    .gte('payment_date', toDate(monthStart))
    .lt('payment_date', toDate(nextMonth))
  if (error) throw new Error(readableCommissionError(error.message, error.code))
  return (data ?? []).reduce((sum, payment) => sum + Number(payment.amount), 0)
}

export async function getCommissionDetail(sellerId: string) {
  const { data, error } = await supabase.rpc('get_seller_commission_detail', { p_seller_id: sellerId })
  if (error) throw new Error(readableCommissionError(error.message, error.code))
  const detail = data as unknown as DetailRow
  return {
    summary: mapSummary(detail.summary),
    sales: (detail.sales ?? []).map((sale) => ({ orderId: sale.order_id, orderNumber: sale.order_number, createdAt: sale.created_at, status: sale.status, saleTotal: Number(sale.sale_total), amountPaid: Number(sale.amount_paid), sellerCommissionAmount: Number(sale.seller_commission_amount), generatedCommissionAmount: Number(sale.generated_commission_amount), remainingCommissionAmount: Number(sale.remaining_commission_amount), isPayable: sale.is_payable })),
    payments: (detail.payments ?? []).map((payment) => ({ id: payment.id, amount: Number(payment.amount), paymentDate: payment.payment_date, note: payment.note, recordedBy: payment.recorded_by, createdAt: payment.created_at })),
  } satisfies SellerCommissionDetail
}

export async function registerCommissionPayment(input: { sellerId: string; amount: number; paymentDate: string; note: string; idempotencyKey: string }) {
  const { data, error } = await supabase.rpc('register_seller_commission_payment', {
    p_seller_id: input.sellerId,
    p_amount: input.amount,
    p_payment_date: input.paymentDate,
    p_note: input.note.trim() || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(readableCommissionError(error.message, error.code))
  return data
}

function mapSummary(row: SummaryRow): SellerCommissionSummary {
  return { sellerId: row.seller_id, fullName: row.full_name, validSales: Number(row.valid_sales), payableCommission: Number(row.payable_commission), cancelledCommission: Number(row.cancelled_commission), paidCommission: Number(row.paid_commission), overpaidCommission: Number(row.overpaid_commission), pendingCommission: Number(row.pending_commission) }
}

function readableCommissionError(message: string, code?: string) {
  if (code === '42501') return 'No tienes permisos para consultar o registrar estas comisiones.'
  if (/exceeds pending/i.test(message)) return 'El pago supera el saldo de comisión pendiente.'
  if (/idempotency/i.test(message)) return 'La solicitud de pago ya fue utilizada con datos diferentes.'
  if (/failed to fetch|network/i.test(message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return message || 'No fue posible completar la operación de comisiones.'
}
