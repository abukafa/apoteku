import { queryClient } from '../packages/db/src/client.ts';

async function check() {
  const units = await queryClient`
    SELECT pu.*, p.name as product_name
    FROM product_units pu
    JOIN products p ON p.id = pu.product_id
    WHERE p.name ILIKE '%CAVIPLEX%'
    ORDER BY pu.conversion_factor DESC;
  `;
  console.table(units);
  await queryClient.end();
}

check();
