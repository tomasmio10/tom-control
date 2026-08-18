import type { AppUser } from '../types'

export const users: AppUser[] = [
  { id: 'admin-demo', name: 'Daniel Apraez', email: 'admin@tomelectric.co', role: 'admin', active: true, status: 'Activo', lastAccess: 'Hoy, 10:42' },
  { id: 'seller-demo', name: 'Laura Gómez', email: 'laura@tomelectric.co', role: 'seller', active: true, status: 'Activo', lastAccess: 'Hoy, 09:18' },
  { id: 'seller-carlos', name: 'Carlos Ruiz', email: 'carlos@tomelectric.co', role: 'seller', active: true, status: 'Activo', lastAccess: 'Ayer, 16:30' },
  { id: 'seller-sofia', name: 'Sofía Martínez', email: 'sofia@tomelectric.co', role: 'seller', active: false, status: 'Inactivo', lastAccess: '03 ago 2026' },
]

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value)
