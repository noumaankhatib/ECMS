-- Seed admin:data permission for SYSTEM_ADMINISTRATOR.
-- Grants the right to view impact trees and perform archive/hard-delete
-- on any entity — strictly for the system administrator role.
INSERT INTO role_permission (role_code, permission, scope)
VALUES ('SYSTEM_ADMINISTRATOR', 'admin:data', 'GLOBAL')
ON CONFLICT (role_code, permission) DO NOTHING;
