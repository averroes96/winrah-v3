-- ============================================================================
-- WINRAH - Shoe Warehouse Management System
-- Sample Seed Data
-- ============================================================================

-- 1. Warehouses
INSERT INTO warehouse (id, name, status) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Dépôt Central (Casablanca)', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'Annexe Nord (Tanger)', 'active')
ON CONFLICT (id) DO NOTHING;

-- 2. Areas
INSERT INTO area (id, warehouse_id, name, status) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Zone Baskets & Sport', 'active'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Zone Bottines & Cuir', 'active'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Zone Escarpins & Soirée', 'active'),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Zone Stock Transit', 'active')
ON CONFLICT (id) DO NOTHING;

-- 3. Sections
INSERT INTO section (id, area_id, name, capacity, status) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Rayon A-01 (Niveau 1)', '50 cartons', 'active'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Rayon A-02 (Niveau 2)', '40 cartons', 'active'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000002', 'Rayon B-01 (Palettes)', '80 cartons', 'active'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002', 'Rayon B-02 (Étagère)', '35 cartons', 'active'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000003', 'Rayon C-01 (VIP)', '25 cartons', 'active'),
  ('c0000000-0000-0000-0000-000000000006', 'b0000000-0000-0000-0000-000000000004', 'Quai Déchargement T-1', '100 cartons', 'active')
ON CONFLICT (id) DO NOTHING;

-- 4. Models (Including duplicate reference codes like HS-21 in two entries)
INSERT INTO model (id, warehouse_id, reference_code, name, size_range, price, photo_url, status, created_at) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'HS-21', 'Sneakers Urban Flow Blanche', '36/41', 249.00, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', 'active', now() - interval '5 days'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'HS-21', 'Sneakers Urban Flow Édition Noire', '40/45', 269.00, 'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=400', 'active', now() - interval '2 days'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'HS-88', 'Bottine Chelsea Cuir Marron', '38/44', 389.00, 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400', 'active', now() - interval '10 days'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'HS-104', 'Escarpin Verni Rouge Velvet', '36/40', 299.00, 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400', 'active', now() - interval '12 days'),
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'TN-09', 'Sandale Compensée Été', '36/41', 189.00, 'https://images.unsplash.com/photo-1560343090-f0409e92791a?w=400', 'active', now() - interval '1 day')
ON CONFLICT (id) DO NOTHING;

-- 5. Model_Section Assignments (Presence-only)
INSERT INTO model_section (id, model_id, section_id) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'), -- HS-21 (1) in Rayon A-01
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002'), -- HS-21 (2) in Rayon A-02
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003'), -- HS-88 in Rayon B-01
  ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000005'), -- HS-104 in Rayon C-01
  ('e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000006')  -- TN-09 in Quai T-1
ON CONFLICT (id) DO NOTHING;
