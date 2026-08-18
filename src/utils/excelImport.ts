import type { ExcelImportResult, ExcelImportRow } from '../types'

const REQUIRED_HEADERS = ['CODIGO', 'NOMBRE DE EL PRODUCTO', 'VENTA', 'COMPRA'] as const

const normalizeHeader = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase()

function parseMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  let text = String(value ?? '').trim().replace(/[$\s]/g, '')
  if (!text) return null
  const lastDot = text.lastIndexOf('.')
  const lastComma = text.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, '')
  } else {
    text = text.replace(',', '.')
  }
  const parsed = Number(text)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

const rowIsEmpty = (row: unknown[]) => row.every((cell) => String(cell ?? '').trim() === '')

export async function parseProductWorkbook(file: File, existingProductCodes: string[]): Promise<ExcelImportResult> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const sheet = workbook.Sheets.Hoja1
  if (!sheet) throw new Error('El archivo no contiene una hoja llamada "Hoja1".')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeHeader)
    return REQUIRED_HEADERS.every((header) => normalized.includes(header))
  })
  if (headerIndex < 0) throw new Error('Hoja1 no contiene las columnas requeridas: CODIGO, NOMBRE DE EL PRODUCTO, VENTA y COMPRA.')
  const headers = matrix[headerIndex].map(normalizeHeader)
  const indexes = Object.fromEntries(REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)])) as Record<(typeof REQUIRED_HEADERS)[number], number>
  const existing = new Set(existingProductCodes.map(normalizeCode))
  const seen = new Set<string>()
  const rows: ExcelImportRow[] = []

  matrix.slice(headerIndex + 1).forEach((sourceRow, offset) => {
    if (rowIsEmpty(sourceRow)) return
    const code = normalizeCode(sourceRow[indexes.CODIGO])
    const name = String(sourceRow[indexes['NOMBRE DE EL PRODUCTO']] ?? '').trim()
    const salePrice = parseMoney(sourceRow[indexes.VENTA])
    const purchasePrice = parseMoney(sourceRow[indexes.COMPRA])
    const issues: string[] = []
    if (!code) issues.push('Falta CODIGO')
    if (!name) issues.push('Falta nombre')
    if (salePrice === null) issues.push('VENTA inválida')
    if (purchasePrice === null) issues.push('COMPRA inválida')
    let status: ExcelImportRow['status'] = issues.length ? 'error' : 'valid'
    let message = issues.join(' · ')
    if (code && (existing.has(code) || seen.has(code))) {
      status = 'duplicate'
      message = existing.has(code) ? 'CODIGO ya existe en el catálogo' : 'CODIGO repetido en el archivo'
    }
    if (code && !seen.has(code)) seen.add(code)
    rows.push({ rowNumber: headerIndex + offset + 2, code, name, salePrice, purchasePrice, status, message: message || 'Listo para importar' })
  })

  return {
    fileName: file.name,
    found: rows.length,
    valid: rows.filter((row) => row.status === 'valid').length,
    errors: rows.filter((row) => row.status === 'error').length,
    duplicates: rows.filter((row) => row.status === 'duplicate').length,
    rows,
  }
}
