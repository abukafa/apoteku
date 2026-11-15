import { queryClient } from '../packages/db/src/client.ts';

async function checkPOs() {
  try {
    const pos = await queryClient`
      SELECT po.id, po.po_number, po.order_date, po.status, po.notes, s.name as supplier_name
      FROM purchase_orders po
      JOIN suppliers s ON s.id = po.supplier_id;
    `;
    console.table(pos);

    const items = await queryClient`
      SELECT poi.id, po.po_number, p.name as product_name, poi.unit_name, poi.qty_ordered, poi.qty_received, poi.notes
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.purchase_order_id
      JOIN products p ON p.id = poi.product_id;
    `;
    console.table(items);

  } catch (err) {
    console.error(err);
  } finally {
    await queryClient.end();
  }
}

checkPOs();
