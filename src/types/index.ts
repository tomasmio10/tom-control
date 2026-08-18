export type UserRole = 'admin' | 'seller'

export interface SessionUser {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
}

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  is_active: boolean
}

export type OrderStatus = 'Pendiente' | 'Preparando' | 'Enviado' | 'Entregado' | 'Cancelado'
export type DatabaseOrderStatus = 'new' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'
export type PaymentMethod = 'cash_sale' | 'bank_transfer' | 'cash' | 'credit'

export interface OrderLine {
  productId: string
  productCode: string
  productName: string
  quantity: number
  unitPrice: number
  unitCost: number
}

export interface Order {
  id: string
  orderNumber: string
  date: string
  client: string
  address: string
  city?: string
  phone?: string
  email?: string
  notes?: string
  paymentMethod: PaymentMethod
  paymentStatus: string
  sellerId: string
  seller: string
  items: number
  products?: OrderLine[]
  total: number
  cost: number
  sellerCommission: number
  adminCommission: number
  shippingCost: number
  companyProfit: number
  status: OrderStatus
  databaseStatus: DatabaseOrderStatus
}

export interface CreateOrderInput {
  customerName: string
  customerCity: string
  paymentMethod: PaymentMethod
  customerPhone?: string
  customerEmail?: string
  customerAddress?: string
  notes?: string
  items: Array<{ productId: string; quantity: number }>
}

export interface Product {
  id: string
  name: string
  category: string
  sku: string
  price: number
  cost?: number
  active: boolean
  description?: string
}

export interface ProductInput {
  name: string
  category: string
  sku: string
  price: number
  cost: number
  active: boolean
  description?: string
}

export interface ProductCategory {
  id: string
  name: string
  active: boolean
}

export interface ProductImportResult {
  imported: number
  errors: string[]
}

export type ImportRowStatus = 'valid' | 'error' | 'duplicate'

export interface ExcelImportRow {
  rowNumber: number
  code: string
  name: string
  salePrice: number | null
  purchasePrice: number | null
  status: ImportRowStatus
  message: string
}

export interface ExcelImportResult {
  fileName: string
  found: number
  valid: number
  errors: number
  duplicates: number
  rows: ExcelImportRow[]
}

export interface AppUser extends SessionUser {
  status: 'Activo' | 'Inactivo'
  lastAccess: string
}
