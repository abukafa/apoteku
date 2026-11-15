import { queryClient } from '../packages/db/src/client.ts';

async function checkAll() {
  try {
    // 1. Check stock_adjustments / opname
    const adjustments = await queryClient`SELECT * FROM stock_adjustments;`;
    console.log('--- STOCK ADJUSTMENTS ---', adjustments.length);
    console.table(adjustments);

    const adjustmentItems = await queryClient`SELECT * FROM stock_adjustment_items;`;
    console.log('--- STOCK ADJUSTMENT ITEMS ---', adjustmentItems.length);
    console.table(adjustmentItems);

    // 2. Check suppliers
    const sups = await queryClient`SELECT id, code, name, is_consignment, is_active FROM suppliers;`;
    console.log('--- SUPPLIERS ---', sups.length);
    console.table(sups);

    // 3. Check purchase orders
    const pos = await queryClient`
      SELECT po.id, po.po_number, po.order_date, po.status, po.notes, s.name as supplier_name,
             COUNT(poi.id) as item_count
      FROM purchase_orders po
      LEFT JOIN suppliers s ON s.id = po.supplier_id
      LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      GROUP BY po.id, s.name;
    `;
    console.log('--- PURCHASE ORDERS ---', pos.length);
    console.table(pos);

    // 4. Check all ledger records to see if any other records exist
    const ledger = await queryClient`
      SELECT sl.id, sl.mutation_type, sl.quantity_base, sl.notes, sl.created_at, p.name as product_name
      FROM stock_ledger sl
      JOIN products p ON p.id = sl.product_id
      ORDER BY sl.created_at ASC;
    `;
    console.log('--- ALL STOCK LEDGER (TOTAL: ' + ledger.length + ') ---');
    console.table(ledger);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

checkAll();
