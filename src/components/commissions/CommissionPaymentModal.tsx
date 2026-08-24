import { useState, type FormEvent } from 'react'
import { registerCommissionPayment } from '../../lib/commissions'
import { formatCurrency } from '../../data/mockData'
import type { SellerCommissionSummary } from '../../types'

export function CommissionPaymentModal({ seller, onClose, onPaid }: { seller: SellerCommissionSummary; onClose: () => void; onPaid: () => Promise<void> }) {
  const [amount, setAmount] = useState(() => String(seller.pendingCommission))
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const numericAmount = Number(amount)
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) { setError('Ingresa un valor mayor que cero.'); return }
    if (numericAmount > seller.pendingCommission) { setError('El pago no puede superar el saldo pendiente.'); return }
    if (!paymentDate) { setError('Selecciona la fecha del pago.'); return }
    setSaving(true)
    try {
      await registerCommissionPayment({ sellerId: seller.sellerId, amount: numericAmount, paymentDate, note, idempotencyKey })
      await onPaid(); onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible registrar el pago.') }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}><section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="commission-payment-title">
    <div className="import-header"><div><span className="eyebrow">PAGO DE COMISIÓN</span><h2 id="commission-payment-title">Registrar pago</h2><p><strong>{seller.fullName}</strong> · Saldo pendiente {formatCurrency(seller.pendingCommission)}</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></div>
    <form onSubmit={submit}><div className="payment-form-grid"><label className="field"><span>Valor a pagar *</span><input type="number" inputMode="decimal" min="0.01" step="0.01" max={seller.pendingCommission} value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus /></label><label className="field"><span>Fecha del pago *</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label className="field wide"><span>Nota opcional</span><textarea maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Referencia, medio de pago u observación" /></label></div>
      {error && <div className="payment-form-error" role="alert">{error}</div>}
      <div className="import-actions"><div><strong>Historial protegido</strong><span>Este pago no podrá editarse ni eliminarse.</span></div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" className="primary-button" disabled={saving || seller.pendingCommission <= 0}>{saving ? 'Registrando…' : 'Registrar pago'}</button></div>
    </form>
  </section></div>
}
