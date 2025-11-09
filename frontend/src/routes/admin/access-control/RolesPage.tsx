import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AccessControlRole,
  createRole,
  listRoles,
  updateRolePermissions,
} from '../../../api/accessControl';

/**
 * Parses a comma-separated string of permissions into an array of strings.
 * @param {string} input - The comma-separated string of permissions.
 * @returns {string[]} An array of permission keys.
 */
function parsePermissions(input: string) {
  return input
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
}

/**
 * A page component for managing access control roles.
 *
 * This component allows users to:
 * - View a list of existing roles and their permissions.
 * - Create new roles with a name, description, and permissions.
 * - Update the permissions for an existing role.
 *
 * @returns {JSX.Element} The rendered roles management page.
 */
export default function RolesPage() {
  const [roles, setRoles] = useState<AccessControlRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<number | null>(null);
  const [permissionInputs, setPermissionInputs] = useState<Record<number, string>>({});

  const [form, setForm] = useState({
    name: '',
    description: '',
    tenantId: '',
    permissions: '',
  });

  useEffect(() => {
    void loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      const loadedRoles = await listRoles();
      setRoles(loadedRoles);
      setPermissionInputs(
        Object.fromEntries(
          loadedRoles.map(role => [role.id, role.permissions.map(item => item.permission.key).join(', ')]),
        ),
      );
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Rollen konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRole = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name) {
      setError('Bitte geben Sie einen Rollennamen ein.');
      return;
    }

    try {
      setCreating(true);
      const role = await createRole({
        name: form.name,
        description: form.description.trim() ? form.description : undefined,
        tenantId: form.tenantId.trim() ? form.tenantId : undefined,
        permissions: parsePermissions(form.permissions),
      });
      setRoles(previous => [...previous, role]);
      setPermissionInputs(previous => ({
        ...previous,
        [role.id]: role.permissions.map(item => item.permission.key).join(', '),
      }));
      setForm({ name: '', description: '', tenantId: '', permissions: '' });
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Rolle konnte nicht erstellt werden.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdatePermissions = async (role: AccessControlRole) => {
    const permissions = parsePermissions(permissionInputs[role.id] ?? '');
    try {
      setUpdating(role.id);
      const updated = await updateRolePermissions({ roleId: role.id, permissions });
      setRoles(previous => previous.map(item => (item.id === updated.id ? updated : item)));
      setPermissionInputs(previous => ({
        ...previous,
        [role.id]: updated.permissions.map(item => item.permission.key).join(', '),
      }));
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Rechte konnten nicht aktualisiert werden.');
    } finally {
      setUpdating(null);
    }
  };

  const totalPermissions = useMemo(
    () =>
      roles.reduce((sum, role) => sum + role.permissions.length, 0),
    [roles],
  );

  return (
    <div className="divide-y divide-slate-800/70">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Rollenverwaltung</h2>
        <p className="mt-1 text-sm text-slate-400">
          Strukturieren Sie Berechtigungen und weisen Sie Mandanten-spezifische Rollen zu.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleCreateRole} className="mt-6 grid gap-4 rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Neue Rolle anlegen
            </h3>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="Manager"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Tenant-ID (optional)</span>
            <input
              type="text"
              value={form.tenantId}
              onChange={event => setForm(previous => ({ ...previous, tenantId: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="tenant-123"
            />
          </label>

          <label className="md:col-span-2 flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Beschreibung</span>
            <textarea
              rows={2}
              value={form.description}
              onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="Beschreiben Sie die Rolle für Ihr Team"
            />
          </label>

          <label className="md:col-span-2 flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Berechtigungen (kommagetrennt)</span>
            <textarea
              rows={2}
              value={form.permissions}
              onChange={event => setForm(previous => ({ ...previous, permissions: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="pos.read, pos.write, refunds.process"
            />
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
            >
              {creating ? 'Wird erstellt...' : 'Rolle erstellen'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Verfügbare Rollen</h3>
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {loading ? 'Lade Daten...' : `${roles.length} Rollen · ${totalPermissions} Berechtigungen`}
          </span>
        </div>

        <div className="mt-4 space-y-4">
          {roles.map(role => (
            <article key={role.id} className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h4 className="text-lg font-medium text-white">{role.name}</h4>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {role.tenantId ? `Tenant: ${role.tenantId}` : 'Global'} · {new Date(role.createdAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200">
                  {role.permissions.length} Berechtigungen
                </span>
              </div>

              {role.description ? (
                <p className="mt-3 text-sm text-slate-300">{role.description}</p>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {role.permissions.length ? (
                  role.permissions.map(permission => (
                    <span
                      key={permission.permissionId}
                      className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-200"
                    >
                      {permission.permission.key}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500">Keine Berechtigungen hinterlegt.</span>
                )}
              </div>

              <div className="mt-6">
                <label className="flex flex-col gap-2 text-sm">
                  <span className="text-slate-300">Berechtigungen aktualisieren</span>
                  <textarea
                    rows={2}
                    value={permissionInputs[role.id] ?? ''}
                    onChange={event =>
                      setPermissionInputs(previous => ({ ...previous, [role.id]: event.target.value }))
                    }
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="pos.read, pos.write"
                  />
                </label>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleUpdatePermissions(role)}
                    disabled={updating === role.id}
                    className="rounded-md border border-indigo-400 px-4 py-2 text-sm font-medium text-indigo-100 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {updating === role.id ? 'Speichere...' : 'Rechte aktualisieren'}
                  </button>
                </div>
              </div>
            </article>
          ))}

          {!loading && roles.length === 0 ? (
            <div className="rounded-lg border border-slate-800/70 bg-slate-950/40 p-6 text-center text-sm text-slate-500">
              Es wurden noch keine Rollen angelegt.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
