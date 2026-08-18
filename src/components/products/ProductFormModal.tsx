import { useState, type FormEvent } from 'react'
import type { Product, ProductCategory, ProductInput } from '../../types'

const emptyInput: ProductInput = { name: '', sku: '', category: '', price: 0, cost: 0, active: true, description: '' }

export function ProductFormModal({ product, categories, onClose, onSubmit }: {
  product: Product | null
  categories: ProductCategory[]
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
}) {
  const [input, setInput] = useState<ProductInput>(() => product ? {
    name: product.name,
    sku: product.sku,
    category: product.category === 'Sin categoría' ? '' : product.category,
    price: product.price,
    cost: product.cost ?? 0,
    active: product.active,
    description: product.description ?? '',
  } : emptyInput)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    if (!input.name.trim() || !input.sku.trim() || !input.category.trim()) { setError('Código, nombre y categoría son obligatorios.'); return }
    if (input.price < 0 || input.cost < 0) { setError('Los precios no pueden ser negativos.'); return }
    setSaving(true)
    try { await onSubmit(input); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar el producto.') }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
    <form className="product-modal" role="dialog" aria-modal="true" aria-labelledby="product-form-title" onSubmit={submit}>
      <header className="import-header"><div><span className="eyebrow">CATÁLOGO SUPABASE</span><h2 id="product-form-title">{product ? 'Editar producto' : 'Nuevo producto'}</h2><p>La información se guardará en el catálogo real de TOM-CONTROL.</p></div><button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button></header>
      <div className="product-form-grid">
        <label className="field"><span>Código *</span><input value={input.sku} onChange={(event) => setInput({ ...input, sku: event.target.value.toUpperCase() })} placeholder="TOM-LED-048" /></label>
        <label className="field"><span>Nombre *</span><input value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} placeholder="Nombre comercial" /></label>
        <label className="field wide"><span>Categoría *</span><input list="product-categories" value={input.category} onChange={(event) => setInput({ ...input, category: event.target.value })} placeholder="Selecciona o escribe una categoría" /><datalist id="product-categories">{categories.filter((category) => category.active).map((category) => <option key={category.id} value={category.name} />)}</datalist></label>
        <label className="field"><span>Precio de venta *</span><input type="number" min="0" step="1" value={input.price} onChange={(event) => setInput({ ...input, price: Number(event.target.value) })} /></label>
        <label className="field"><span>Costo de compra *</span><input type="number" min="0" step="1" value={input.cost} onChange={(event) => setInput({ ...input, cost: Number(event.target.value) })} /></label>
        <label className="field wide"><span>Descripción</span><textarea value={input.description} onChange={(event) => setInput({ ...input, description: event.target.value })} placeholder="Detalles opcionales del producto" /></label>
        <label className="product-active-field"><input type="checkbox" checked={input.active} onChange={(event) => setInput({ ...input, active: event.target.checked })} /><span>Producto activo y disponible para vendedores</span></label>
      </div>
      {error && <div className="product-form-error" role="alert">{error}</div>}
      <footer className="import-actions"><div><strong>{product ? 'Actualizar catálogo' : 'Crear en Supabase'}</strong><span>El costo se guarda separadamente en product_costs.</span></div><button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? 'Guardando…' : 'Guardar producto'}</button></footer>
    </form>
  </div>
}
