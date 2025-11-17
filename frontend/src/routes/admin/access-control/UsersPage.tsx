import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AccessControlRole,
  AccessControlUser,
  assignRole,
  createUser,
  listRoles,
  listUsers,
  updateUserStatus,
} from '../../../api/accessControl';
import { useTenantAccessScope } from './TenantAccessContext';

/**
 * A page component for managing users in the access control system.
 *
 * This component provides functionality to:
 * - View a list of all users.
 * - Create new users with a name, email and password for the active tenant scope.
 * - Activate or deactivate existing users.
 * - Assign roles to users.
 *
 * @returns {JSX.Element} The rendered user management page.
 */
export default function UsersPage() {
  const { tenantId } = useTenantAccessScope();
  const [users, setUsers] = useState<AccessControlUser[]>([]);
  const [roles, setRoles] = useState<AccessControlRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<number | null>(null);
  const [roleAssignments, setRoleAssignments] = useState<Record<number, number | ''>>({});
  const [assigningFor, setAssigningFor] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  });

  const sortedUsers = useMemo(
    () =>
      [...users].sort(
        (first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime(),
      ),
    [users],
  );

  useEffect(() => {
    void loadData();
  }, [tenantId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [loadedUsers, loadedRoles] = await Promise.all([listUsers(tenantId), listRoles(tenantId)]);
      setUsers(loadedUsers);
      setRoles(loadedRoles);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Fehler beim Laden der Benutzer und Rollen.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.name || !form.email || !form.password) {
      setError('Bitte füllen Sie alle Pflichtfelder aus.');
      return;
    }

    try {
      setCreating(true);
      const user = await createUser(tenantId, {
        name: form.name,
        email: form.email,
        password: form.password,
      });
      setUsers(previous => [user, ...previous]);
      setRoleAssignments(previous => ({ ...previous, [user.id]: '' }));
      setForm({ name: '', email: '', password: '' });
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Benutzer konnte nicht erstellt werden.');
    } finally {
      setCreating(false);
    }
  };

  const handleToggleStatus = async (user: AccessControlUser) => {
    try {
      setStatusUpdating(user.id);
      const updated = await updateUserStatus(tenantId, {
        userId: user.id,
        isActive: !user.isActive,
      });
      setUsers(previous => previous.map(item => (item.id === updated.id ? { ...item, ...updated } : item)));
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Status konnte nicht aktualisiert werden.');
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleAssignRole = async (userId: number) => {
    const selected = roleAssignments[userId];
    if (typeof selected !== 'number') {
      setError('Bitte wählen Sie eine Rolle aus.');
      return;
    }

    try {
      setAssigningFor(userId);
      const updated = await assignRole(tenantId, { userId, roleId: selected });
      setUsers(previous => previous.map(item => (item.id === updated.id ? updated : item)));
      setRoleAssignments(previous => ({ ...previous, [userId]: '' }));
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Rolle konnte nicht zugewiesen werden.');
    } finally {
      setAssigningFor(null);
    }
  };

  const activeRoles = useMemo(() => roles.map(role => ({ id: role.id, name: role.name })), [roles]);

  return (
    <div className="divide-y divide-slate-800/70">
      <div className="p-6">
        <h2 className="text-xl font-semibold text-white">Benutzerübersicht</h2>
        <p className="mt-1 text-sm text-slate-400">
          Legen Sie neue Benutzer an, aktivieren oder deaktivieren Sie Zugänge und weisen Sie Rollen zu.
        </p>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleCreateUser} className="mt-6 grid gap-4 rounded-lg border border-slate-800/80 bg-slate-950/40 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <h3 className="text-sm font-medium uppercase tracking-wide text-slate-400">
              Neuen Benutzer anlegen
            </h3>
          </div>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Name</span>
            <input
              type="text"
              value={form.name}
              onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="Max Mustermann"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">E-Mail</span>
            <input
              type="email"
              value={form.email}
              onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="max@fuchspos.de"
              required
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-slate-300">Passwort</span>
            <input
              type="password"
              minLength={10}
              value={form.password}
              onChange={event => setForm(previous => ({ ...previous, password: event.target.value }))}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
              placeholder="Mindestens 10 Zeichen"
              required
            />
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="inline-flex items-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white shadow transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-indigo-500/60"
            >
              {creating ? 'Wird erstellt...' : 'Benutzer anlegen'}
            </button>
          </div>
        </form>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Aktive Benutzer</h3>
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {loading ? 'Lade Daten...' : `${users.length} Benutzer`}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">E-Mail</th>
                <th className="px-4 py-3">Rollen</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedUsers.map(user => (
                <tr key={user.id} className="hover:bg-slate-900/50">
                  <td className="px-4 py-3 text-slate-100">
                    <div className="font-medium">{user.name ?? '—'}</div>
                    <div className="text-xs text-slate-500">
                      {new Date(user.createdAt).toLocaleString('de-DE')}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {user.roles.length ? (
                        user.roles.map(role => (
                          <span
                            key={role.roleId}
                            className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs text-indigo-200"
                          >
                            {role.role.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">Keine Rolle</span>
                      )}
                    </div>
                    {roles.length ? (
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
                        <select
                          value={roleAssignments[user.id] ?? ''}
                          onChange={event =>
                            setRoleAssignments(previous => ({
                              ...previous,
                              [user.id]: event.target.value ? Number(event.target.value) : '',
                            }))
                          }
                          className="min-w-[12rem] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100 focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="">Rolle auswählen</option>
                          {activeRoles.map(role => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssignRole(user.id)}
                          disabled={assigningFor === user.id}
                          className="rounded-md bg-slate-200 px-3 py-1 font-medium text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-slate-200/60"
                        >
                          {assigningFor === user.id ? 'Wird zugewiesen...' : 'Zuweisen'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.isActive
                          ? 'inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200'
                          : 'inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200'
                      }
                    >
                      <span className="h-2 w-2 rounded-full bg-current"></span>
                      {user.isActive ? 'Aktiv' : 'Deaktiviert'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{user.tenantId ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(user)}
                      disabled={statusUpdating === user.id}
                      className="rounded-md border border-slate-600 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-indigo-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {statusUpdating === user.id ? 'Speichere...' : user.isActive ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && sortedUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    Es wurden noch keine Benutzer angelegt.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
