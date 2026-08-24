import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/ui/PageHeader'
import { useOrders } from '../context/OrdersContext'
import { useProducts } from '../context/ProductsContext'
import { formatCurrency } from '../data/mockData'
import type { OrderLine, PaymentMethod } from '../types'

type EditableOrderLine = Omit<OrderLine, 'quantity'> & { quantity: number | '' }

const emptyLine = (): EditableOrderLine => ({ productId: '', productCode: '', productName: '', quantity: 1, unitPrice: 0, unitCost: 0 })
const paymentMethods: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash_sale', label: 'Contra entrega' },
  { value: 'credit', label: 'Crédito' },
]

export function NewOrderPage() {
  const { createOrder } = useOrders()
  const { products, loading: productsLoading, error: productsError } = useProducts()
  const navigate = useNavigate()
  const [client, setClient] = useState({ name: '', city: '', phone: '', email: '', address: '', notes: '', paymentMethod: 'cash_sale' as PaymentMethod })
  const [lines, setLines] = useState<EditableOrderLine[]>([emptyLine()])
  const [errors, setErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const updateProduct = (index: number, productId: string) => {
    const product = products.find((item) => item.id === productId)
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? {
      productId, productCode: product?.sku ?? '', productName: product?.name ?? '', quantity: line.quantity, unitPrice: product?.price ?? 0, unitCost: 0,
    } : line))
  }
  const updateQuantity = (index: number, value: string) => {
    if (value !== '' && (!/^\d+$/.test(value) || Number(value) < 1)) return
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: value === '' ? '' : Number(value) } : line))
  }
  const normalizeQuantity = (index: number) => setLines((current) => current.map((line, lineIndex) => lineIndex === index && (line.quantity === '' || line.quantity < 1) ? { ...line, quantity: 1 } : line))
  const removeLine = (index: number) => setLines((current) => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index))
  const subtotal = lines.reduce((sum, line) => sum + (line.quantity || 0) * line.unitPrice, 0)

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setErrors([])
    const validation: string[] = []
    if (!client.name.trim()) validation.push('Ingresa el nombre del cliente.')
    if (!client.city.trim()) validation.push('Ingresa la ciudad.')
    if (client.email && !/^\S+@\S+\.\S+$/.test(client.email)) validation.push('Ingresa un correo válido.')
    if (lines.some((line) => !line.productId)) validation.push('Selecciona un producto en cada fila.')
    if (validation.length) { setErrors(validation); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    setSaving(true)
    try {
      const created = await createOrder({
        customerName: client.name, customerCity: client.city, paymentMethod: client.paymentMethod,
        customerPhone: client.phone, customerEmail: client.email, customerAddress: client.address, notes: client.notes,
        items: lines.map((line) => ({ productId: line.productId, quantity: line.quantity || 1 })),
      })
      navigate('/pedidos', { state: { createdId: String(created.order_number) }, replace: true })
    } catch (cause) { setErrors([cause instanceof Error ? cause.message : 'No fue posible guardar el pedido.']) }
    finally { setSaving(false) }
  }

  return <form onSubmit={submit} className="order-form">
    <PageHeader eyebrow="NUEVO REGISTRO" title="Crear pedido" description="Completa los datos comerciales. Supabase calculará precios, comisiones y utilidad." action={<Link className="secondary-button" to="/pedidos">← Volver a pedidos</Link>} />
    {productsError && <div className="form-errors" role="alert"><strong>No fue posible cargar el catálogo de productos</strong><span>{productsError}</span></div>}
    {errors.length > 0 && <div className="form-errors" role="alert"><strong>Revisa la información del pedido</strong>{errors.map((error) => <span key={error}>{error}</span>)}</div>}
    <div className="order-layout"><div className="order-content">
      <section className="form-section"><div className="section-heading"><span>01</span><div><h2>Datos del cliente</h2><p>Nombre y ciudad son obligatorios; los demás datos son opcionales.</p></div><div className="generated-id"><small>Número de pedido</small><strong>Automático</strong></div></div>
        <div className="form-grid"><label className="field"><span>Nombre del cliente *</span><input value={client.name} onChange={(event) => setClient({ ...client, name: event.target.value })} placeholder="Ej. Constructora Horizonte" /></label><label className="field"><span>Ciudad *</span><input value={client.city} onChange={(event) => setClient({ ...client, city: event.target.value })} placeholder="Ej. Bogotá" /></label><label className="field"><span>Teléfono</span><input type="tel" value={client.phone} onChange={(event) => setClient({ ...client, phone: event.target.value })} placeholder="Ej. 300 123 4567" /></label><label className="field"><span>Correo electrónico</span><input type="email" value={client.email} onChange={(event) => setClient({ ...client, email: event.target.value })} placeholder="cliente@empresa.com" /></label><label className="field wide"><span>Dirección</span><input value={client.address} onChange={(event) => setClient({ ...client, address: event.target.value })} placeholder="Dirección de entrega" /></label><label className="field"><span>Método de pago *</span><select value={client.paymentMethod} onChange={(event) => setClient({ ...client, paymentMethod: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}</select></label><label className="field wide"><span>Notas</span><textarea value={client.notes} onChange={(event) => setClient({ ...client, notes: event.target.value })} placeholder="Observaciones opcionales" /></label></div>
      </section>
      <section className="form-section"><div className="section-heading"><span>02</span><div><h2>Productos</h2><p>La RPC validará productos, precios y cantidades en Supabase.</p></div></div>
        <div className="product-lines"><div className="line-head"><span>Producto</span><span>Cantidad</span><span>Precio referencial</span><span>Subtotal referencial</span><span /></div>
          {lines.map((line, index) => <div className="product-line" key={index}><label><span className="mobile-label">Producto</span><select value={line.productId} disabled={productsLoading || Boolean(productsError)} onChange={(event) => updateProduct(index, event.target.value)}><option value="">{productsLoading ? 'Cargando catálogo…' : 'Seleccionar producto...'}</option>{products.filter((product) => product.active).map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label><span className="mobile-label">Cantidad</span><input type="number" inputMode="numeric" pattern="[0-9]*" min="1" max="999" step="1" value={line.quantity} onFocus={(event) => { const input = event.currentTarget; window.requestAnimationFrame(() => input.select()) }} onChange={(event) => updateQuantity(index, event.target.value)} onBlur={() => normalizeQuantity(index)} /></label><div><span className="mobile-label">Precio referencial</span><strong>{formatCurrency(line.unitPrice)}</strong></div><div><span className="mobile-label">Subtotal referencial</span><strong>{formatCurrency(line.unitPrice * (line.quantity || 0))}</strong></div><button type="button" className="remove-line" onClick={() => removeLine(index)} disabled={lines.length === 1} aria-label={`Eliminar producto ${index + 1}`}>×</button></div>)}
        </div><button type="button" className="add-line" onClick={() => setLines((current) => [...current, emptyLine()])}>+ Agregar otro producto</button>
      </section>
    </div><aside className="order-summary"><div className="summary-title"><span>03</span><div><h2>Resumen comercial</h2><p>El total definitivo se calculará en Supabase.</p></div></div><div className="summary-id"><span>Número de pedido</span><strong>Automático</strong></div><div className="summary-total"><span>Total referencial</span><strong>{formatCurrency(subtotal)}</strong></div><button className="primary-button save-order" type="submit" disabled={saving || productsLoading || Boolean(productsError)}>{saving ? 'Guardando…' : 'Guardar pedido'} <span>→</span></button><small className="local-note">Precios y valores financieros serán validados por la RPC.</small></aside></div>
  </form>
}
