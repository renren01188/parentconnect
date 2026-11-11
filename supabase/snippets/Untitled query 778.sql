INSERT INTO public.ict_admins (
  employee_id,
  first_name,
  last_name,
  email,
  phone,
  password_hash,
  password_set,
  status,
  archive_status
) VALUES (
  'ICT-DEMO-001',
  'Demo',
  'ICT',
  'ict.demo@local.test',
  '09123456789',
  extensions.crypt('password', extensions.gen_salt('bf', 10)),
  true,
  'active',
  'active'
);