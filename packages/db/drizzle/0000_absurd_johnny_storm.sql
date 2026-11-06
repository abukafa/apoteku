CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"address" text,
	"phone" varchar(50),
	"receipt_header" text,
	"receipt_footer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cashier_shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shift_number" integer NOT NULL,
	"start_time" timestamp with time zone DEFAULT now() NOT NULL,
	"end_time" timestamp with time zone,
	"initial_cash" numeric(24, 8) NOT NULL,
	"expected_cash" numeric(24, 8) DEFAULT '0' NOT NULL,
	"actual_cash" numeric(24, 8) DEFAULT '0' NOT NULL,
	"cash_difference" numeric(24, 8) DEFAULT '0' NOT NULL,
	"total_non_cash" numeric(24, 8) DEFAULT '0' NOT NULL,
	"total_sales" numeric(24, 8) DEFAULT '0' NOT NULL,
	"notes" text,
	"is_open" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_id_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source_database" varchar(255) NOT NULL,
	"source_table" varchar(100) NOT NULL,
	"legacy_key" varchar(255) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"tax_percent" numeric(5, 2) DEFAULT '11.00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"legacy_id_fastbatch" integer,
	"batch_no" varchar(100),
	"expired_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_name" varchar(50) NOT NULL,
	"conversion_factor" numeric(24, 8) NOT NULL,
	"sale_price_general" numeric(24, 8) DEFAULT '0' NOT NULL,
	"sale_price_resep" numeric(24, 8) DEFAULT '0' NOT NULL,
	"sale_price_grosir" numeric(24, 8) DEFAULT '0' NOT NULL,
	"sale_price_delivery" numeric(24, 8) DEFAULT '0' NOT NULL,
	"sale_price_member" numeric(24, 8) DEFAULT '0' NOT NULL,
	"is_base_unit" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_id_barang" integer,
	"sku" varchar(50) NOT NULL,
	"barcode" varchar(100),
	"name" varchar(255) NOT NULL,
	"active_substance" text,
	"dosage_form" varchar(100),
	"default_dosage" text,
	"indications" text,
	"side_effects" text,
	"rack_location" varchar(50),
	"drug_class" varchar(50) DEFAULT 'BEBAS' NOT NULL,
	"base_unit" varchar(50) NOT NULL,
	"min_stock" numeric(24, 8) DEFAULT '0' NOT NULL,
	"is_consignment" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_batch_stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"qty_base" numeric(24, 8) DEFAULT '0' NOT NULL,
	"buy_price" numeric(24, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_stocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"total_qty_base" numeric(24, 8) DEFAULT '0' NOT NULL,
	"unbatched_qty_base" numeric(24, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_adjustment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"line_no" integer NOT NULL,
	"system_qty_base" numeric(24, 8) NOT NULL,
	"actual_qty_base" numeric(24, 8) NOT NULL,
	"difference_qty_base" numeric(24, 8) NOT NULL,
	"cost_per_unit" numeric(24, 8) DEFAULT '0' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"adjustment_number" varchar(100) NOT NULL,
	"adjustment_date" date NOT NULL,
	"reason" text NOT NULL,
	"status" varchar(50) DEFAULT 'COMMITTED' NOT NULL,
	"performed_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid,
	"batch_id" uuid,
	"mutation_type" varchar(50) NOT NULL,
	"quantity_base" numeric(24, 8) NOT NULL,
	"cost_per_unit" numeric(24, 8) DEFAULT '0' NOT NULL,
	"reference_id" uuid NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"qty_sent_base" numeric(24, 8) NOT NULL,
	"qty_received_base" numeric(24, 8),
	"discrepancy_qty_base" numeric(24, 8) DEFAULT '0' NOT NULL,
	"discrepancy_reason" text,
	"cost_per_unit" numeric(24, 8) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_number" varchar(100) NOT NULL,
	"source_branch_id" uuid NOT NULL,
	"dest_branch_id" uuid NOT NULL,
	"source_location_id" uuid NOT NULL,
	"dest_location_id" uuid NOT NULL,
	"status" varchar(50) DEFAULT 'DISPATCHED' NOT NULL,
	"tracking_courier" varchar(100),
	"notes" text,
	"receipt_notes" text,
	"shipped_by" uuid NOT NULL,
	"received_by" uuid,
	"shipped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_id_pelanggan" integer,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"customer_type" varchar(50) DEFAULT 'UMUM' NOT NULL,
	"gender" varchar(10),
	"birth_date" date,
	"phone" varchar(50),
	"address" text,
	"point_balance" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_compound_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compound_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid,
	"batch_id" uuid,
	"line_no" integer NOT NULL,
	"qty_base" numeric(24, 8) NOT NULL,
	"unit_price" numeric(24, 8) NOT NULL,
	"cost_price" numeric(24, 8) DEFAULT '0' NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_compounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"compound_name" varchar(255) NOT NULL,
	"dosage_form" varchar(50) DEFAULT 'PUYER' NOT NULL,
	"quantity" numeric(24, 8) NOT NULL,
	"tuslah_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"embalase_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL,
	"dosage_rules" text
);
--> statement-breakpoint
CREATE TABLE "sales_transaction_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"location_id" uuid,
	"batch_id" uuid,
	"unit_name" varchar(50) NOT NULL,
	"conversion_factor" numeric(24, 8) NOT NULL,
	"qty" numeric(24, 8) NOT NULL,
	"qty_base" numeric(24, 8) NOT NULL,
	"unit_price" numeric(24, 8) NOT NULL,
	"discount_percent" numeric(24, 8) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL,
	"dosage_rules" text
);
--> statement-breakpoint
CREATE TABLE "sales_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"cashier_shift_id" uuid NOT NULL,
	"invoice_no" varchar(100) NOT NULL,
	"cashier_user_id" uuid NOT NULL,
	"customer_id" uuid,
	"customer_type" varchar(50) DEFAULT 'UMUM' NOT NULL,
	"patient_name" varchar(255),
	"doctor_name" varchar(255),
	"prescription_image_url" text,
	"payment_method" varchar(50) NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL,
	"discount_percent" numeric(24, 8) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"tax_percent" numeric(24, 8) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"tuslah_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"embalase_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"grand_total" numeric(24, 8) NOT NULL,
	"paid_amount" numeric(24, 8) NOT NULL,
	"change_amount" numeric(24, 8) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"qty_received" numeric(24, 8) NOT NULL,
	"cost_price" numeric(24, 8) NOT NULL,
	"subtotal_cost" numeric(24, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"receipt_number" varchar(100) NOT NULL,
	"receipt_date" date NOT NULL,
	"notes" text,
	"received_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_settlement_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"line_no" integer NOT NULL,
	"sold_qty" numeric(24, 8) NOT NULL,
	"returned_qty" numeric(24, 8) DEFAULT '0' NOT NULL,
	"lost_qty" numeric(24, 8) DEFAULT '0' NOT NULL,
	"unit_cost" numeric(24, 8) NOT NULL,
	"subtotal_payable" numeric(24, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consignment_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"settlement_number" varchar(100) NOT NULL,
	"settlement_date" date NOT NULL,
	"total_sold_amount" numeric(24, 8) NOT NULL,
	"discount_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"total_paid_amount" numeric(24, 8) NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"notes" text,
	"settled_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "debt_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"purchase_invoice_id" uuid NOT NULL,
	"payment_number" varchar(100) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"amount_paid" numeric(24, 8) NOT NULL,
	"receipt_scan_url" text,
	"paid_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"unit_name" varchar(50) NOT NULL,
	"conversion_factor" numeric(24, 8) NOT NULL,
	"qty" numeric(24, 8) NOT NULL,
	"qty_base" numeric(24, 8) NOT NULL,
	"buy_price" numeric(24, 8) NOT NULL,
	"discount_percent" numeric(24, 8) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"purchase_order_id" uuid,
	"legacy_id_pembelian" integer,
	"invoice_number" varchar(100) NOT NULL,
	"receive_date" date NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"is_credit" boolean DEFAULT true NOT NULL,
	"subtotal" numeric(24, 8) NOT NULL,
	"discount_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"tax_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"grand_total" numeric(24, 8) NOT NULL,
	"paid_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"is_paid_off" boolean DEFAULT false NOT NULL,
	"invoice_scan_url" text,
	"received_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"po_number" varchar(100) NOT NULL,
	"status" varchar(50) DEFAULT 'ORDERED' NOT NULL,
	"order_date" date NOT NULL,
	"expected_delivery_date" date,
	"total_amount" numeric(24, 8) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legacy_id_supplier" integer,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(50),
	"email" varchar(100),
	"address" text,
	"contact_person" varchar(100),
	"payment_term_days" integer DEFAULT 30 NOT NULL,
	"lead_time_days" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cashier_shifts" ADD CONSTRAINT "cashier_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_id_map" ADD CONSTRAINT "legacy_id_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_units" ADD CONSTRAINT "product_units_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_batch_stocks" ADD CONSTRAINT "branch_batch_stocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_batch_stocks" ADD CONSTRAINT "branch_batch_stocks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_batch_stocks" ADD CONSTRAINT "branch_batch_stocks_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_batch_stocks" ADD CONSTRAINT "branch_batch_stocks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_batch_stocks" ADD CONSTRAINT "branch_batch_stocks_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustment_items" ADD CONSTRAINT "stock_adjustment_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_branch_id_branches_id_fk" FOREIGN KEY ("source_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dest_branch_id_branches_id_fk" FOREIGN KEY ("dest_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_location_id_inventory_locations_id_fk" FOREIGN KEY ("source_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dest_location_id_inventory_locations_id_fk" FOREIGN KEY ("dest_location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compound_items" ADD CONSTRAINT "sales_compound_items_compound_id_sales_compounds_id_fk" FOREIGN KEY ("compound_id") REFERENCES "public"."sales_compounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compound_items" ADD CONSTRAINT "sales_compound_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compound_items" ADD CONSTRAINT "sales_compound_items_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compound_items" ADD CONSTRAINT "sales_compound_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compounds" ADD CONSTRAINT "sales_compounds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_compounds" ADD CONSTRAINT "sales_compounds_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transaction_items" ADD CONSTRAINT "sales_transaction_items_transaction_id_sales_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."sales_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transaction_items" ADD CONSTRAINT "sales_transaction_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transaction_items" ADD CONSTRAINT "sales_transaction_items_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transaction_items" ADD CONSTRAINT "sales_transaction_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_cashier_shift_id_cashier_shifts_id_fk" FOREIGN KEY ("cashier_shift_id") REFERENCES "public"."cashier_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_transactions" ADD CONSTRAINT "sales_transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipt_items" ADD CONSTRAINT "consignment_receipt_items_receipt_id_consignment_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."consignment_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipt_items" ADD CONSTRAINT "consignment_receipt_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipt_items" ADD CONSTRAINT "consignment_receipt_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipts" ADD CONSTRAINT "consignment_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipts" ADD CONSTRAINT "consignment_receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipts" ADD CONSTRAINT "consignment_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_receipts" ADD CONSTRAINT "consignment_receipts_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlement_items" ADD CONSTRAINT "consignment_settlement_items_settlement_id_consignment_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."consignment_settlements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlement_items" ADD CONSTRAINT "consignment_settlement_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlement_items" ADD CONSTRAINT "consignment_settlement_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consignment_settlements" ADD CONSTRAINT "consignment_settlements_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_location_id_inventory_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."inventory_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoice_items" ADD CONSTRAINT "purchase_invoice_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_branch_tenant_code" ON "branches" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_shift_branch_date" ON "cashier_shifts" USING btree ("branch_id","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_location_branch_code" ON "inventory_locations" USING btree ("branch_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_legacy_source_key" ON "legacy_id_map" USING btree ("tenant_id","source_database","source_table","legacy_key");--> statement-breakpoint
CREATE INDEX "idx_legacy_entity" ON "legacy_id_map" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_batch" ON "product_batches" USING btree ("tenant_id","product_id","batch_no","expired_date");--> statement-breakpoint
CREATE INDEX "idx_product_legacy_fastbatch" ON "product_batches" USING btree ("tenant_id","legacy_id_fastbatch");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_unit" ON "product_units" USING btree ("product_id","unit_name");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_tenant_sku" ON "products" USING btree ("tenant_id","sku");--> statement-breakpoint
CREATE INDEX "idx_products_search" ON "products" USING btree ("tenant_id","name","barcode");--> statement-breakpoint
CREATE INDEX "idx_products_substance" ON "products" USING btree ("tenant_id","active_substance");--> statement-breakpoint
CREATE INDEX "idx_products_rack" ON "products" USING btree ("tenant_id","rack_location");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_location_product_batch_stock" ON "branch_batch_stocks" USING btree ("location_id","product_id","batch_id");--> statement-breakpoint
CREATE INDEX "idx_fefo_lookup" ON "branch_batch_stocks" USING btree ("branch_id","location_id","product_id","qty_base");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_location_product_stock" ON "branch_stocks" USING btree ("location_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_adjustment_line" ON "stock_adjustment_items" USING btree ("adjustment_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_adjustment_number" ON "stock_adjustments" USING btree ("tenant_id","adjustment_number");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_audit" ON "stock_ledger" USING btree ("branch_id","product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transfer_line" ON "stock_transfer_items" USING btree ("transfer_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transfer_number" ON "stock_transfers" USING btree ("tenant_id","transfer_number");--> statement-breakpoint
CREATE INDEX "idx_transfer_status" ON "stock_transfers" USING btree ("dest_branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_tenant_code" ON "customers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_customer_search" ON "customers" USING btree ("tenant_id","name","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_compound_item_line" ON "sales_compound_items" USING btree ("compound_id","line_no");--> statement-breakpoint
CREATE INDEX "idx_compound_product" ON "sales_compound_items" USING btree ("compound_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_compound_trx" ON "sales_compounds" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_transaction_line" ON "sales_transaction_items" USING btree ("transaction_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sales_invoice" ON "sales_transactions" USING btree ("tenant_id","invoice_no");--> statement-breakpoint
CREATE INDEX "idx_sales_created" ON "sales_transactions" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_consignment_receipt_line" ON "consignment_receipt_items" USING btree ("receipt_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_consignment_receipt" ON "consignment_receipts" USING btree ("tenant_id","receipt_number");--> statement-breakpoint
CREATE INDEX "idx_consignment_receipt_supplier" ON "consignment_receipts" USING btree ("branch_id","supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_consignment_settlement_line" ON "consignment_settlement_items" USING btree ("settlement_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_consignment_settlement" ON "consignment_settlements" USING btree ("tenant_id","settlement_number");--> statement-breakpoint
CREATE INDEX "idx_debt_payment_invoice" ON "debt_payments" USING btree ("purchase_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_purchase_line" ON "purchase_invoice_items" USING btree ("invoice_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_invoice" ON "purchase_invoices" USING btree ("tenant_id","supplier_id","invoice_number");--> statement-breakpoint
CREATE INDEX "idx_purchase_due_date" ON "purchase_invoices" USING btree ("branch_id","due_date","is_paid_off");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_po_tenant_number" ON "purchase_orders" USING btree ("tenant_id","po_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_supplier_tenant_code" ON "suppliers" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_supplier_search" ON "suppliers" USING btree ("tenant_id","name");