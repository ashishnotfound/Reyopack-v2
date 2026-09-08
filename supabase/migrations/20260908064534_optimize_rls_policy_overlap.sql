-- Keep read access in one policy per table. `for all` policies also apply to
-- SELECT, so splitting privileged writes prevents duplicate permissive-policy
-- evaluation without changing authorization behavior.

drop policy roles_super_admin_all on public.user_roles;
create policy roles_super_admin_insert on public.user_roles for insert to authenticated with check (private.is_super_admin());
create policy roles_super_admin_update on public.user_roles for update to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
create policy roles_super_admin_delete on public.user_roles for delete to authenticated using (private.is_super_admin());

drop policy warehouses_admin_write on public.warehouses;
create policy warehouses_admin_insert on public.warehouses for insert to authenticated with check (private.is_admin());
create policy warehouses_admin_update on public.warehouses for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy warehouses_admin_delete on public.warehouses for delete to authenticated using (private.is_admin());

drop policy locations_admin_write on public.locations;
create policy locations_admin_insert on public.locations for insert to authenticated with check (private.is_admin());
create policy locations_admin_update on public.locations for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy locations_admin_delete on public.locations for delete to authenticated using (private.is_admin());

drop policy products_admin_write on public.products;
create policy products_admin_insert on public.products for insert to authenticated with check (private.is_admin());
create policy products_admin_update on public.products for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy products_admin_delete on public.products for delete to authenticated using (private.is_admin());

drop policy product_images_admin_write on public.product_images;
create policy product_images_admin_insert on public.product_images for insert to authenticated with check (private.is_admin());
create policy product_images_admin_update on public.product_images for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy product_images_admin_delete on public.product_images for delete to authenticated using (private.is_admin());

drop policy product_barcodes_admin_write on public.product_barcodes;
create policy product_barcodes_admin_insert on public.product_barcodes for insert to authenticated with check (private.is_admin());
create policy product_barcodes_admin_update on public.product_barcodes for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy product_barcodes_admin_delete on public.product_barcodes for delete to authenticated using (private.is_admin());

drop policy marketplaces_admin_write on public.marketplaces;
create policy marketplaces_admin_insert on public.marketplaces for insert to authenticated with check (private.is_admin());
create policy marketplaces_admin_update on public.marketplaces for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy marketplaces_admin_delete on public.marketplaces for delete to authenticated using (private.is_admin());

drop policy marketplace_products_admin_write on public.marketplace_products;
create policy marketplace_products_admin_insert on public.marketplace_products for insert to authenticated with check (private.is_admin());
create policy marketplace_products_admin_update on public.marketplace_products for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy marketplace_products_admin_delete on public.marketplace_products for delete to authenticated using (private.is_admin());

drop policy orders_admin_write on public.orders;
create policy orders_admin_insert on public.orders for insert to authenticated with check (private.is_admin());
create policy orders_admin_update on public.orders for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy orders_admin_delete on public.orders for delete to authenticated using (private.is_admin());

drop policy order_items_admin_write on public.order_items;
create policy order_items_admin_insert on public.order_items for insert to authenticated with check (private.is_admin());
create policy order_items_admin_update on public.order_items for update to authenticated using (private.is_admin()) with check (private.is_admin());
create policy order_items_admin_delete on public.order_items for delete to authenticated using (private.is_admin());

drop policy settings_super_admin_write on public.system_settings;
create policy settings_super_admin_insert on public.system_settings for insert to authenticated with check (private.is_super_admin());
create policy settings_super_admin_update on public.system_settings for update to authenticated using (private.is_super_admin()) with check (private.is_super_admin());
create policy settings_super_admin_delete on public.system_settings for delete to authenticated using (private.is_super_admin());

drop policy labels_admin_write on storage.objects;
create policy labels_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'temporary-labels' and private.is_admin());
create policy labels_admin_update on storage.objects for update to authenticated using (bucket_id = 'temporary-labels' and private.is_admin()) with check (bucket_id = 'temporary-labels' and private.is_admin());
create policy labels_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'temporary-labels' and private.is_admin());
