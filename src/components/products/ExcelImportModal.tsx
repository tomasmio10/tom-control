import { useRef, useState, type ChangeEvent } from 'react'
import { formatCurrency } from '../../data/mockData'
import type { ExcelImportResult, ProductImportResult, ProductInput } from '../../types'
import { parseProductWorkbook } from '../../utils/excelImport'

export function ExcelImportModal({ existingCodes, onClose, onConfirm }: { existingCodes: string[]; onClose: () => void; onConfirm: (products: ProductInput[]) => Promise<ProductImportResult> }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ExcelImportResult | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [completed, setCompleted] = useState<ProductImportResult | null>(null)

  const selectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try { setResult(await parseProductWorkbook(file, existingCodes)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible leer el archivo seleccionado.') }
    finally { setLoading(false); event.target.value = '' }
  }

  const confirm = async () => {
    if (!result) return
    setImporting(true); setError('')
    try {
      const importResult = await onConfirm(result.rows.filter((row) => row.status === 'valid').map((row) => ({
        sku: row.code,
        name: row.name,
        category: 'Importado desde Excel',
        price: row.salePrice ?? 0,
        cost: row.purchasePrice ?? 0,
        active: true,
      })))
      if (!importResult.errors.length) onClose()
      else setCompleted(importResult)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar los productos en Supabase.') }
    finally { setImporting(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header className="import-header"><div><span className="eyebrow">IMPORTACIÓN MASIVA</span><h2 id="import-title">Importar productos desde Excel</h2><p>Se leerá únicamente la hoja <strong>Hoja1</strong>. Nada se importará hasta que confirmes.</p></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></header>
      {!result && <div className="upload-area"><input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={selectFile} hidden /><span className="excel-symbol">X</span><h3>{loading ? 'Analizando productos…' : 'Selecciona el archivo de TOM-ELECTRIC'}</h3><p>Columnas requeridas: CODIGO, NOMBRE DE EL PRODUCTO, VENTA y COMPRA.</p><button type="button" className="primary-button" disabled={loading} onClick={() => inputRef.current?.click()}>{loading ? 'Procesando…' : 'Seleccionar archivo Excel'}</button><small>Las filas vacías se ignoran. CODIGO y nombre son obligatorios.</small></div>}
      {error && <div className="import-error" role="alert"><span>!</span><div><strong>No se pudo completar la importación</strong><p>{error}</p></div>{!result && <button type="button" className="secondary-button" onClick={() => inputRef.current?.click()}>Elegir otro archivo</button>}</div>}
      {completed && <div className="import-error" role="alert"><span>!</span><div><strong>Importación parcial: {completed.imported} guardados</strong><p>{completed.errors.slice(0, 3).join(' · ')}</p></div></div>}
      {result && <><div className="import-file"><div><span>Archivo analizado</span><strong>{result.fileName}</strong></div><button type="button" onClick={() => { setResult(null); setError('') }}>Cambiar archivo</button></div>
        <div className="import-stats"><article><span>Encontrados</span><strong>{result.found}</strong></article><article className="valid"><span>Válidos</span><strong>{result.valid}</strong></article><article className="invalid"><span>Con errores</span><strong>{result.errors}</strong></article><article className="duplicate"><span>Duplicados</span><strong>{result.duplicates}</strong></article></div>
        <div className="preview-heading"><div><h3>Vista previa</h3><p>Solo se agregarán las filas marcadas como válidas.</p></div><span>{result.rows.length} filas evaluadas</span></div>
        <div className="import-table-wrap"><table className="import-table"><thead><tr><th>Fila</th><th>CODIGO</th><th>NOMBRE</th><th>VENTA</th><th>COMPRA</th><th>Resultado</th></tr></thead><tbody>{result.rows.map((row) => <tr key={row.rowNumber} className={row.status}><td>{row.rowNumber}</td><td><strong>{row.code || '—'}</strong></td><td>{row.name || '—'}</td><td>{row.salePrice === null ? '—' : formatCurrency(row.salePrice)}</td><td>{row.purchasePrice === null ? '—' : formatCurrency(row.purchasePrice)}</td><td><span className={`import-status ${row.status}`}>{row.status === 'valid' ? 'Válido' : row.status === 'duplicate' ? 'Duplicado' : 'Error'}</span><small>{row.message}</small></td></tr>)}</tbody></table></div>
        <footer className="import-actions"><div><strong>{completed ? `${completed.imported} productos guardados` : `${result.valid} productos listos`}</strong><span>{completed ? 'Revisa los errores antes de cerrar.' : 'Se guardarán en products y product_costs de Supabase.'}</span></div><button type="button" className="secondary-button" onClick={onClose}>{completed ? 'Cerrar' : 'Cancelar'}</button><button type="button" className="primary-button" disabled={!result.valid || importing || Boolean(completed)} onClick={() => void confirm()}>{importing ? 'Guardando…' : 'Confirmar importación'}</button></footer></>}
    </section>
  </div>
}
