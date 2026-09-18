-- Fecha grants herdados de ALTER DEFAULT PRIVILEGES em instalações novas.
-- A escrita da principal continua somente pelas RPCs auditadas do dono.
revoke all on public.platform_primary_organization from public, anon, authenticated, service_role;
grant select on public.platform_primary_organization to service_role;
