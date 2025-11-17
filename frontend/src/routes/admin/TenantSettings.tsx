import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CashRegisterProfile,
  TenantProfile,
  TssProfile,
  createCashRegister,
  createTss,
  deleteCashRegister,
  deleteTss,
  listTenantProfiles,
  updateCashRegister,
  updateTss,
} from '../../api/tenantConfig';

const defaultTssForm = {
  id: '',
  serialNumber: '',
  description: '',
  state: '',
  certPath: '',
};

const defaultRegisterForm = {
  id: '',
  label: '',
  location: '',
  tssId: '',
  isDefault: false,
};

export default function TenantSettings() {
  const [profiles, setProfiles] = useState<TenantProfile[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tssForm, setTssForm] = useState(defaultTssForm);
  const [registerForm, setRegisterForm] = useState(defaultRegisterForm);
  const [editingTssId, setEditingTssId] = useState<string | null>(null);
  const [editingRegisterId, setEditingRegisterId] = useState<string | null>(null);
  const [savingTss, setSavingTss] = useState(false);
  const [savingRegister, setSavingRegister] = useState(false);

  const selectedTenant = useMemo(
    () => profiles.find(profile => profile.id === selectedTenantId) ?? null,
    [profiles, selectedTenantId],
  );

  const defaultCashRegister = selectedTenant?.cashRegisters.find(register => register.isDefault) ?? null;

  const loadProfiles = async () => {
    try {
      setLoading(true);
      const data = await listTenantProfiles();
      setProfiles(data);
      if (!selectedTenantId && data.length > 0) {
        setSelectedTenantId(data[0].id);
      }
      if (selectedTenantId && !data.some(profile => profile.id === selectedTenantId)) {
        setSelectedTenantId(data[0]?.id ?? '');
      }
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Mandantenprofile konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  useEffect(() => {
    const firstTssId = selectedTenant?.tsses[0]?.id ?? '';
    setTssForm(defaultTssForm);
    setRegisterForm({ ...defaultRegisterForm, tssId: firstTssId });
    setEditingTssId(null);
    setEditingRegisterId(null);
  }, [selectedTenantId, selectedTenant?.tsses?.length]);

  const handleSubmitTss = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError('Bitte wählen Sie zuerst einen Mandanten.');
      return;
    }
    if (!editingTssId && !tssForm.id.trim()) {
      setError('Eine TSS-ID ist erforderlich.');
      return;
    }

    try {
      setSavingTss(true);
      if (editingTssId) {
        await updateTss(editingTssId, {
          serialNumber: tssForm.serialNumber || undefined,
          description: tssForm.description || undefined,
          state: tssForm.state || undefined,
          certPath: tssForm.certPath || undefined,
        });
      } else {
        await createTss(selectedTenantId, {
          id: tssForm.id.trim(),
          serialNumber: tssForm.serialNumber || undefined,
          description: tssForm.description || undefined,
          state: tssForm.state || undefined,
          certPath: tssForm.certPath || undefined,
        });
      }
      await loadProfiles();
      setTssForm(defaultTssForm);
      setEditingTssId(null);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Die TSS konnte nicht gespeichert werden.');
    } finally {
      setSavingTss(false);
    }
  };

  const handleSubmitRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedTenantId) {
      setError('Bitte wählen Sie zuerst einen Mandanten.');
      return;
    }
    if (!editingRegisterId && !registerForm.id.trim()) {
      setError('Eine Kassen-ID ist erforderlich.');
      return;
    }
    if (!registerForm.tssId) {
      setError('Bitte ordnen Sie eine TSS zu.');
      return;
    }

    try {
      setSavingRegister(true);
      if (editingRegisterId) {
        await updateCashRegister(editingRegisterId, {
          label: registerForm.label || undefined,
          location: registerForm.location || undefined,
          tssId: registerForm.tssId,
          isDefault: registerForm.isDefault,
        });
      } else {
        await createCashRegister(selectedTenantId, {
          id: registerForm.id.trim(),
          label: registerForm.label || undefined,
          location: registerForm.location || undefined,
          tssId: registerForm.tssId,
          isDefault: registerForm.isDefault,
        });
      }
      await loadProfiles();
      const nextTssId = selectedTenant?.tsses[0]?.id ?? registerForm.tssId;
      setRegisterForm({ ...defaultRegisterForm, tssId: nextTssId });
      setEditingRegisterId(null);
      setError(null);
    } catch (cause) {
      console.error(cause);
      setError('Die Kasse konnte nicht gespeichert werden.');
    } finally {
      setSavingRegister(false);
    }
  };

  const startEditTss = (profile: TssProfile) => {
    setEditingTssId(profile.id);
    setTssForm({
      id: profile.id,
      serialNumber: profile.serialNumber ?? '',
      description: profile.description ?? '',
      state: profile.state ?? '',
      certPath: profile.certPath ?? '',
    });
  };

  const startEditRegister = (profile: CashRegisterProfile) => {
    setEditingRegisterId(profile.id);
    setRegisterForm({
      id: profile.id,
      label: profile.label ?? '',
      location: profile.location ?? '',
      tssId: profile.tssId,
      isDefault: profile.isDefault,
    });
  };

  const handleDeleteTss = async (profile: TssProfile) => {
    if (!window.confirm(`Soll die TSS ${profile.id} wirklich gelöscht werden?`)) {
      return;
    }
    try {
      await deleteTss(profile.id);
      await loadProfiles();
    } catch (cause) {
      console.error(cause);
      setError('Die TSS konnte nicht gelöscht werden.');
    }
  };

  const handleDeleteRegister = async (profile: CashRegisterProfile) => {
    if (!window.confirm(`Soll die Kasse ${profile.id} wirklich gelöscht werden?`)) {
      return;
    }
    try {
      await deleteCashRegister(profile.id);
      await loadProfiles();
    } catch (cause) {
      console.error(cause);
      setError('Die Kasse konnte nicht gelöscht werden.');
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Admin</p>
        <h1 className="text-2xl font-semibold text-white">Mandanten &amp; POS-Profile</h1>
        <p className="mt-1 text-sm text-slate-400">
          Hinterlegen Sie Fiskaly-TSS und Kassenstandorte, damit der POS die richtigen IDs und Labels anzeigen kann.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-xl border border-slate-800/60 bg-slate-950/50 p-4">
        <label className="flex flex-1 flex-col gap-2 text-sm text-slate-300 min-w-[220px]">
          <span>Mandant auswählen</span>
          <select
            value={selectedTenantId}
            onChange={event => setSelectedTenantId(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Bitte wählen</option>
            {profiles.map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.name} ({profile.id})
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void loadProfiles()}
          className="self-end rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-indigo-300"
        >
          Aktualisieren
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-slate-800/60 bg-slate-950/40 p-6 text-sm text-slate-400">Lade Mandantenprofile...</div>
      ) : !selectedTenant ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-sm text-amber-100">
          Es sind noch keine Mandanten hinterlegt.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-400">Mandant</p>
              <p className="text-lg font-semibold text-white">{selectedTenant.name}</p>
              <p className="text-xs text-slate-500">ID: {selectedTenant.id}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-400">TSS</p>
              <p className="text-lg font-semibold text-white">{selectedTenant.tsses.length}</p>
              <p className="text-xs text-slate-500">davon aktiv für Fiskaly</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
              <p className="text-sm text-slate-400">Kassen</p>
              <p className="text-lg font-semibold text-white">{selectedTenant.cashRegisters.length}</p>
              <p className="text-xs text-slate-500">
                Standard: {defaultCashRegister ? defaultCashRegister.label ?? defaultCashRegister.id : 'Keine'}
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Technische Sicherheitseinrichtungen</h2>
                <p className="text-sm text-slate-400">
                  Pflegen Sie Zertifikatpfade und Seriennummern für Ihre Fiskaly-Instanzen.
                </p>
              </div>
              <form onSubmit={handleSubmitTss} className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">
                    {editingTssId ? `TSS ${editingTssId} bearbeiten` : 'Neue TSS anlegen'}
                  </h3>
                  {editingTssId ? (
                    <button
                      type="button"
                      className="text-xs text-indigo-300"
                      onClick={() => {
                        setEditingTssId(null);
                        setTssForm(defaultTssForm);
                      }}
                    >
                      Abbrechen
                    </button>
                  ) : null}
                </div>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>TSS-ID</span>
                  <input
                    type="text"
                    value={tssForm.id}
                    onChange={event => setTssForm(previous => ({ ...previous, id: event.target.value }))}
                    disabled={Boolean(editingTssId)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none disabled:cursor-not-allowed"
                    placeholder="fiscal-tss-01"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>Seriennummer</span>
                  <input
                    type="text"
                    value={tssForm.serialNumber}
                    onChange={event => setTssForm(previous => ({ ...previous, serialNumber: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="SN123456789"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>Status</span>
                  <input
                    type="text"
                    value={tssForm.state}
                    onChange={event => setTssForm(previous => ({ ...previous, state: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="ACTIVE"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300 md:col-span-2">
                  <span>Beschreibung</span>
                  <input
                    type="text"
                    value={tssForm.description}
                    onChange={event => setTssForm(previous => ({ ...previous, description: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="Hauptkasse EG"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300 md:col-span-2">
                  <span>Zertifikatspfad (optional)</span>
                  <input
                    type="text"
                    value={tssForm.certPath}
                    onChange={event => setTssForm(previous => ({ ...previous, certPath: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="/certs/fiskaly.pem"
                  />
                </label>

                <button
                  type="submit"
                  disabled={savingTss}
                  className="md:col-span-2 rounded-lg border border-indigo-500/60 bg-indigo-500/20 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-300 disabled:cursor-wait"
                >
                  {savingTss ? 'Speichern...' : editingTssId ? 'Änderungen speichern' : 'TSS anlegen'}
                </button>
              </form>

              <div className="space-y-3">
                {selectedTenant.tsses.length === 0 ? (
                  <p className="text-sm text-slate-500">Noch keine TSS hinterlegt.</p>
                ) : (
                  selectedTenant.tsses.map(profile => (
                    <div key={profile.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">{profile.id}</p>
                          <p className="text-xs text-slate-400">{profile.description || 'Keine Beschreibung'}</p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          <button
                            type="button"
                            className="text-indigo-300"
                            onClick={() => startEditTss(profile)}
                          >
                            Bearbeiten
                          </button>
                          <button
                            type="button"
                            className="text-rose-300"
                            onClick={() => handleDeleteTss(profile)}
                          >
                            Löschen
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                        <span>Seriennr.: {profile.serialNumber || '—'}</span>
                        <span>Status: {profile.state || '—'}</span>
                        <span>Zertifikat: {profile.certPath || '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/60 p-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Kassen &amp; Standorte</h2>
                <p className="text-sm text-slate-400">Verknüpfen Sie Kassen mit TSS und geben Sie Labels für das POS-Frontend an.</p>
              </div>
              <form onSubmit={handleSubmitRegister} className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-300">
                    {editingRegisterId ? `Kasse ${editingRegisterId} bearbeiten` : 'Neue Kasse anlegen'}
                  </h3>
                  {editingRegisterId ? (
                    <button
                      type="button"
                      className="text-xs text-indigo-300"
                      onClick={() => {
                        setEditingRegisterId(null);
                        setRegisterForm({ ...defaultRegisterForm, tssId: selectedTenant?.tsses[0]?.id ?? '' });
                      }}
                    >
                      Abbrechen
                    </button>
                  ) : null}
                </div>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>Kassen-ID</span>
                  <input
                    type="text"
                    value={registerForm.id}
                    onChange={event => setRegisterForm(previous => ({ ...previous, id: event.target.value }))}
                    disabled={Boolean(editingRegisterId)}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none disabled:cursor-not-allowed"
                    placeholder="pos-register-01"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>Label / Anzeige</span>
                  <input
                    type="text"
                    value={registerForm.label}
                    onChange={event => setRegisterForm(previous => ({ ...previous, label: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="Barista Station"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>Standort / Raum</span>
                  <input
                    type="text"
                    value={registerForm.location}
                    onChange={event => setRegisterForm(previous => ({ ...previous, location: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                    placeholder="EG Bar"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm text-slate-300">
                  <span>TSS-Zuordnung</span>
                  <select
                    value={registerForm.tssId}
                    onChange={event => setRegisterForm(previous => ({ ...previous, tssId: event.target.value }))}
                    className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 focus:border-indigo-400 focus:outline-none"
                  >
                    <option value="">Bitte wählen</option>
                    {selectedTenant.tsses.map(profile => (
                      <option key={profile.id} value={profile.id}>
                        {profile.description || profile.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-3 text-sm text-slate-300 md:col-span-2">
                  <input
                    type="checkbox"
                    checked={registerForm.isDefault}
                    onChange={event => setRegisterForm(previous => ({ ...previous, isDefault: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-400"
                  />
                  <span>Als Standardkasse für den POS hinterlegen</span>
                </label>

                <button
                  type="submit"
                  disabled={savingRegister}
                  className="md:col-span-2 rounded-lg border border-emerald-500/60 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 disabled:cursor-wait"
                >
                  {savingRegister ? 'Speichern...' : editingRegisterId ? 'Kasse aktualisieren' : 'Kasse anlegen'}
                </button>
              </form>

              <div className="space-y-3">
                {selectedTenant.cashRegisters.length === 0 ? (
                  <p className="text-sm text-slate-500">Noch keine Kassen hinterlegt.</p>
                ) : (
                  selectedTenant.cashRegisters.map(profile => (
                    <div key={profile.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">{profile.label || profile.id}</p>
                          <p className="text-xs text-slate-400">ID: {profile.id}</p>
                        </div>
                        <div className="flex gap-2 text-xs">
                          {profile.isDefault ? (
                            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-200">Standard</span>
                          ) : null}
                          <button type="button" className="text-indigo-300" onClick={() => startEditRegister(profile)}>
                            Bearbeiten
                          </button>
                          <button type="button" className="text-rose-300" onClick={() => handleDeleteRegister(profile)}>
                            Löschen
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                        <span>Standort: {profile.location || '—'}</span>
                        <span>TSS: {profile.tssId}</span>
                        <span>Aktualisiert: {new Date(profile.updatedAt).toLocaleString('de-DE')}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
