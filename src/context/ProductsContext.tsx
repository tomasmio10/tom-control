import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PostgrestError } from '@supabase/supabase-js'
import { useAuth } from './AuthContext'
import { supabase } from '../lib/supabase'
import type { Product, ProductCategory, ProductImportResult, ProductInput } from '../types'

interface ProductRow {
  id: string
  code: string
  name: string
  description: string | null
  category_id: string | null
  sale_price: number
  is_active: boolean
}

interface CategoryRow {
  id: string
  name: string
  is_active: boolean
}

interface CostRow {
  product_id: string
  purchase_cost: number
}

interface ProductsContextValue {
  products: Product[]
  categories: ProductCategory[]
  loading: boolean
  error: string | null
  refreshProducts: () => Promise<void>
  createProduct: (input: ProductInput) => Promise<void>
  updateProduct: (id: string, input: ProductInput) => Promise<void>
  toggleProductActive: (product: Product) => Promise<void>
  importProducts: (products: ProductInput[]) => Promise<ProductImportResult>
}

const ProductsContext = createContext<ProductsContextValue | null>(null)

function readableProductError(error: PostgrestError | null) {
  if (!error) return null
  if (error.code === '42501') return 'Tu perfil no tiene permisos para realizar esta operación.'
  if (error.code === '23505') return 'Ya existe un producto con ese código.'
  if (/failed to fetch|network/i.test(error.message)) return 'No fue posible conectar con Supabase. Revisa tu conexión.'
  return error.message || 'Ocurrió un error al consultar el catálogo.'
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshProducts = useCallback(async () => {
    if (!user) { setProducts([]); setCategories([]); setError(null); return }
    setLoading(true); setError(null)

    let productsQuery = supabase
      .from('products')
      .select('id, code, name, description, category_id, sale_price, is_active')
      .order('name')
    let categoriesQuery = supabase
      .from('categories')
      .select('id, name, is_active')
      .order('name')

    if (user.role === 'seller') {
      productsQuery = productsQuery.eq('is_active', true)
      categoriesQuery = categoriesQuery.eq('is_active', true)
    }

    const [productResponse, categoryResponse] = await Promise.all([productsQuery, categoriesQuery])
    if (productResponse.error || categoryResponse.error) {
      setProducts([]); setCategories([])
      setError(readableProductError(productResponse.error ?? categoryResponse.error))
      setLoading(false)
      return
    }

    const categoryRows = (categoryResponse.data ?? []) as CategoryRow[]
    const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]))
    let costs = new Map<string, number>()

    if (user.role === 'admin') {
      const costResponse = await supabase.from('product_costs').select('product_id, purchase_cost')
      if (costResponse.error) {
        setProducts([]); setCategories([])
        setError(readableProductError(costResponse.error))
        setLoading(false)
        return
      }
      costs = new Map(((costResponse.data ?? []) as CostRow[]).map((cost) => [cost.product_id, Number(cost.purchase_cost)]))
    }

    setCategories(categoryRows.map((category) => ({ id: category.id, name: category.name, active: category.is_active })))
    setProducts(((productResponse.data ?? []) as ProductRow[]).map((product) => ({
      id: product.id,
      sku: product.code,
      name: product.name,
      category: product.category_id ? categoryNames.get(product.category_id) ?? 'Sin categoría' : 'Sin categoría',
      price: Number(product.sale_price),
      cost: user.role === 'admin' ? costs.get(product.id) : undefined,
      active: product.is_active,
      description: product.description ?? undefined,
    })))
    setLoading(false)
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshProducts(), 0)
    return () => window.clearTimeout(timer)
  }, [refreshProducts])

  const requireAdmin = useCallback(() => {
    if (user?.role !== 'admin') throw new Error('Tu perfil no tiene permisos para modificar productos.')
  }, [user])

  const saveProductWithRpc = useCallback(async (id: string | null, input: ProductInput) => {
    const { error: rpcError } = await supabase.rpc('save_product', {
      p_input: {
        id,
        code: input.sku.trim().toUpperCase(),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category_name: input.category.trim(),
        sale_price: input.price,
        purchase_cost: input.cost,
        is_active: input.active,
      },
    })
    if (rpcError) throw new Error(readableProductError(rpcError) ?? 'No fue posible guardar el producto mediante save_product.')
  }, [])

  const createProduct = useCallback(async (input: ProductInput) => {
    requireAdmin()
    await saveProductWithRpc(null, input)
    await refreshProducts()
  }, [refreshProducts, requireAdmin, saveProductWithRpc])

  const updateProduct = useCallback(async (id: string, input: ProductInput) => {
    requireAdmin()
    await saveProductWithRpc(id, input)
    await refreshProducts()
  }, [refreshProducts, requireAdmin, saveProductWithRpc])

  const toggleProductActive = useCallback(async (product: Product) => {
    requireAdmin()
    const { error: updateError } = await supabase.from('products').update({ is_active: !product.active }).eq('id', product.id)
    if (updateError) throw new Error(readableProductError(updateError) ?? 'No fue posible cambiar el estado del producto.')
    await refreshProducts()
  }, [refreshProducts, requireAdmin])

  const importProducts = useCallback(async (incoming: ProductInput[]): Promise<ProductImportResult> => {
    requireAdmin()
    let imported = 0
    const errors: string[] = []
    for (const product of incoming) {
      try { await saveProductWithRpc(null, product); imported += 1 }
      catch (cause) { errors.push(`${product.sku}: ${cause instanceof Error ? cause.message : 'Error desconocido.'}`) }
    }
    await refreshProducts()
    return { imported, errors }
  }, [refreshProducts, requireAdmin, saveProductWithRpc])

  const value = useMemo(() => ({ products, categories, loading, error, refreshProducts, createProduct, updateProduct, toggleProductActive, importProducts }), [products, categories, loading, error, refreshProducts, createProduct, updateProduct, toggleProductActive, importProducts])
  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProducts() {
  const context = useContext(ProductsContext)
  if (!context) throw new Error('useProducts debe usarse dentro de ProductsProvider')
  return context
}
