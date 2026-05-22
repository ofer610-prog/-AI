-- חלק א: ארגון וצוות
UPDATE organizations SET name = 'משרד עו"ד כהן-רוגוזינסקי' WHERE id = (SELECT id FROM organizations LIMIT 1);

INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'לידור', 'lawyer', 'לידור@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'פולינה', 'lawyer', 'פולינה@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'צופית', 'lawyer', 'צופית@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO profiles (id, organization_id, full_name, role, email, is_active) SELECT gen_random_uuid(), id, 'עופר', 'admin', 'עופר@meshrad.co.il', true FROM organizations LIMIT 1 ON CONFLICT DO NOTHING;