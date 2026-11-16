/**
 * Formatters untuk Satuan Bertingkat (Multi-Unit Packaging) Farmasi
 * Contoh: Box -> Strip -> Tablet, Botol -> Dus
 */

export interface PackUnit {
  unitName: string;
  conversionFactor: number;
}

export interface PackBreakdownItem {
  unitName: string;
  count: number;
  conversionFactor: number;
}

/**
 * Menghasilkan petunjuk kemasan (pack hint) dari kuantitas satuan dasar
 * Misal: 25 Tablet dengan satuan Box (100) dan Strip (10) -> "2 Strip + 5 Tablet"
 * Jika hanya satuan dasar atau 0 -> mengembalikan string kosong "" (atau opsi withFallback)
 */
export function formatPackHint(
  qtyBase: number,
  baseUnit: string,
  units?: PackUnit[]
): string {
  if (!units || units.length <= 1 || qtyBase <= 0) return "";

  const packUnits = [...units]
    .filter((u) => Number(u.conversionFactor) > 1 && u.unitName.toUpperCase() !== baseUnit.toUpperCase())
    .sort((a, b) => Number(b.conversionFactor) - Number(a.conversionFactor));

  const largest = packUnits.find((u) => qtyBase >= Number(u.conversionFactor));
  if (!largest) return "";

  const factor = Number(largest.conversionFactor);
  const whole = Math.floor(qtyBase / factor);
  const rem = Math.round((qtyBase - whole * factor) * 100) / 100;

  if (whole <= 0) return "";
  return rem > 0
    ? `${whole} ${largest.unitName} + ${rem} ${baseUnit}`
    : `${whole} ${largest.unitName}`;
}

/**
 * Memecah kuantitas dasar ke dalam hierarki kemasan bertingkat secara lengkap
 * Misal: 215 Tablet (Box @ 100, Strip @ 10, Tablet @ 1) ->
 * [ { unitName: "Box", count: 2 }, { unitName: "Strip", count: 1 }, { unitName: "Tablet", count: 5 } ]
 */
export function breakDownToPacks(
  qtyBase: number,
  baseUnit: string,
  units: PackUnit[]
): PackBreakdownItem[] {
  if (qtyBase <= 0) return [];
  if (!units || units.length === 0) {
    return [{ unitName: baseUnit, count: qtyBase, conversionFactor: 1 }];
  }

  // Urutkan satuan dari factor terbesar ke terkecil
  const sorted = [...units]
    .map((u) => ({ unitName: u.unitName, conversionFactor: Math.max(1, Number(u.conversionFactor) || 1) }))
    .sort((a, b) => b.conversionFactor - a.conversionFactor);

  let remaining = qtyBase;
  const result: PackBreakdownItem[] = [];

  for (const u of sorted) {
    if (u.conversionFactor > 1 && remaining >= u.conversionFactor) {
      const count = Math.floor(remaining / u.conversionFactor);
      result.push({
        unitName: u.unitName,
        count,
        conversionFactor: u.conversionFactor
      });
      remaining %= u.conversionFactor;
    }
  }

  if (remaining > 0 || result.length === 0) {
    result.push({
      unitName: baseUnit,
      count: remaining,
      conversionFactor: 1
    });
  }

  return result;
}
