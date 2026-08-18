import { useMemo, useState } from 'react'
import { ExcelImportModal } from '../components/products/ExcelImportModal'
import { ProductFormModal } from '../components/products/ProductFormModal'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuth } from '../context/AuthContext'
import { useProducts } from '../context/ProductsContext'
import { formatCurrency } from '../data/mockData'
import type { Product, ProductInput } from '../types'

export function ProductsPage() {
  const { user } = useAuth()
  const { products, categories, loading, error, refreshProducts, createProduct, updateProduct, toggleProductActive, importProducts } = useProducts()
  const admin = user?.role === 'admin'
  const [query, setQuery] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [importedCount, setImportedCount] = useState(0)
  const [actionError, setActionError] = useState('')
  const visible = useMemo(() => products.filter((product) => `${product.name} ${product.category} ${product.sku}`.toLowerCase().includes(query.toLowerCase())), [products, query])

  const saveProduct = async (input: ProductInput) => {
    setActionError('')
    if (editingProduct) await updateProduct(editingProduct.id, input)
    else await createProduct(input)
  }

  const changeActive = async (product: Product) => {
    const nextState = product.active ? 'desactivar' : 'activar'
    if (!window.confirm(`¿Confirmas ${nextState} el producto ${product.name}?`)) return
    setActionError('')
    try { await toggleProductActive(product) }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No fue posible cambiar el estado del producto.') }
  }

  return <>
    <PageHeader eyebrow="CATÁLOGO COMERCIAL" title="Productos" description={admin ? 'Administra el catálogo real, sus precios y costos en Supabase.' : 'Consulta los productos activos disponibles para tus pedidos.'} action={admin ? <div className="header-actions"><button className="secondary-button excel-button" onClick={() => setImportOpen(true)}>▦ Importar Excel</button><button className="primary-button" onClick={() => { setEditingProduct(null); setFormOpen(true) }}>+ Nuevo producto</button></div> : undefined} />
    {importedCount > 0 && <div className="success-banner" role="status"><span>✓</span><div><strong>{importedCount} productos importados correctamente</strong><small>Ya están guardados en Supabase y disponibles en Nuevo pedido.</small></div><button type="button" onClick={() => setImportedCount(0)} aria-label="Cerrar confirmación">×</button></div>}
    {(error || actionError) && <div className="catalog-error" role="alert"><span>!</span><div><strong>No fue posible completar la operación</strong><p>{actionError || error}</p></div><button type="button" className="secondary-button" onClick={() => { setActionError(''); void refreshProducts() }}>Reintentar</button></div>}
    {admin && <section className="stats-grid compact"><StatCardMini label="Productos activos" value={String(products.filter((product) => product.active).length)} /><StatCardMini label="Productos en catálogo" value={String(products.length)} /><StatCardMini label="Categorías" value={String(categories.length)} /></section>}
    <section className="panel"><div className="toolbar"><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, categoría o código..." /></label></div>
      {loading ? <div className="catalog-loading" role="status"><span /><strong>Cargando catálogo desde Supabase…</strong></div> : <div className="table-wrap"><table><thead><tr><th>Producto / código</th><th>Categoría</th><th>Venta</th>{admin && <><th>Compra</th><th>Margen</th><th>Estado</th><th>Acciones</th></>}</tr></thead><tbody>{visible.map((product) => <tr key={product.id}><td><div className="product-cell"><span>{product.name[0]}</span><div><strong>{product.name}</strong><small>{product.sku}</small></div></div></td><td>{product.category}</td><td className="money">{formatCurrency(product.price)}</td>{admin && <><td>{formatCurrency(product.cost ?? 0)}</td><td className="profit">{product.price > 0 && product.cost !== undefined ? `${Math.round((1 - product.cost / product.price) * 100)}%` : '—'}</td><td><span className={`status ${product.active ? 'activo' : 'inactivo'}`}>{product.active ? 'Activo' : 'Inactivo'}</span></td><td><div className="product-actions"><button type="button" onClick={() => { setEditingProduct(product); setFormOpen(true) }}>Editar</button><button type="button" className={product.active ? 'danger' : ''} onClick={() => void changeActive(product)}>{product.active ? 'Desactivar' : 'Activar'}</button></div></td></>}</tr>)}</tbody></table>{!visible.length && !error && <div className="empty-state">{query ? 'No hay productos que coincidan con la búsqueda.' : 'El catálogo todavía no tiene productos.'}</div>}</div>}
      <div className="table-footer">Mostrando {visible.length} de {products.length} productos <span>Catálogo persistente en Supabase</span></div>
    </section>
    {admin && importOpen && <ExcelImportModal existingCodes={products.map((product) => product.sku)} onClose={() => setImportOpen(false)} onConfirm={async (incoming) => { const result = await importProducts(incoming); setImportedCount(result.imported); return result }} />}
    {admin && formOpen && <ProductFormModal product={editingProduct} categories={categories} onClose={() => { setFormOpen(false); setEditingProduct(null) }} onSubmit={saveProduct} />}
  </>
}

function StatCardMini({ label, value }: { label: string; value: string }) { return <article className="mini-stat"><span>{label}</span><strong>{value}</strong></article> }
