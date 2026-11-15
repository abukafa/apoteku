import { queryClient } from '../packages/db/src/client.ts';

async function check() {
  try {
    const batches = await queryClient`
      SELECT pb.id, pb.batch_no, pb.product_id, p.name as product_name, bbs.qty_base, pb.created_at
      FROM product_batches pb
      JOIN products p ON p.id = pb.product_id
      LEFT JOIN branch_batch_stocks bbs ON bbs.batch_id = pb.id
      WHERE p.name IN ('TERA F TAB', 'CAVIPLEX CDEZ STRIP', 'AB - VASK 5 (AMLODIPIN 5MG)')
      ORDER BY pb.created_at ASC;
    `;
    console.log('--- PRODUCT BATCHES & BATCH STOCKS ---');
    console.table(batches);

    // Check if there are any purchase orders linked to those invoices
    const pos = await queryClient`
      SELECT id, po_number, order_date, status, notes
      FROM purchase_orders
      ORDER BY created_at DESC;
    `;
    console.log('--- PURCHASE ORDERS ---');
    console.table(pos);

    // Check purchase order items notes for [Faktur FP-...]
    const poItems = await queryClient`
      SELECT poi.id, poi.notes, p.name as product_name
      FROM purchase_order_items poi
      JOIN products p ON p.id = poi.product_id
      WHERE poi.notes ILIKE '%faktur%';
    `;
    console.log('--- PO ITEMS WITH FAKTUR IN NOTES ---');
    console.table(poItems);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

check();
