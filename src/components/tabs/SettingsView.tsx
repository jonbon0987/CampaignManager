import { useState } from 'react';
import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { useToast } from '../../context/ToastContext';
import type { WorldCampaign } from '../../types/world';
import type { Levelling, RulesEdition } from '../../lib/database.types';
import { signOut } from '../../lib/auth';
import { Button } from '../ui/Button';
import { DiscordBotSettings } from '../session/DiscordBotSettings';
import { ExportCampaignPanel } from '../export/ExportCampaign';
import { SlashField } from '../ui/SlashField';
import { SaveStatusIndicator } from '../ui/SaveStatusIndicator';
import { useAutoSave } from '../../hooks/useAutoSave';
import { limitFor } from '../../lib/fieldLimits';

function SettingRow({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="set-label">{label}</div>
        <div className="set-help">{help}</div>
      </div>
      {children}
    </div>
  );
}

function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`cm-pill ${active ? 'is-active' : ''}`} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}

/** The campaign's name, saved when the DM leaves the field or presses Enter. */
function NameField({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const commit = () => {
    const next = value.trim();
    if (!next) { setValue(name); return; }
    if (next !== name) void onSave(next);
  };
  return (
    <input className="as-input set-name" value={value} aria-label="Campaign name" maxLength={limitFor('campaigns', 'name')}
      onChange={e => setValue(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setValue(name); }} />
  );
}

/** The pitch and the house notes: what the campaign is, and how this table plays it. Saved as you type. */
function CampaignNotes() {
  const { overview, setOverview } = useCampaign();
  const [form, setForm] = useState({ plotSummary: overview.plotSummary, worldInfo: overview.worldInfo });
  const { status, saveNow } = useAutoSave({
    data: form,
    delay: 800,
    onSave: async f => { await setOverview(prev => ({ ...prev, ...f })); },
  });
  return (
    <>
      <div className="set-field">
        <div className="set-field-head">
          <span className="set-label">Pitch</span>
          <SaveStatusIndicator status={status} onRetry={saveNow} />
        </div>
        <span className="set-help">The story in a paragraph: the hook, the trouble, what the campaign is about. Home shows its first line.</span>
        <SlashField value={form.plotSummary} onChange={v => setForm(f => ({ ...f, plotSummary: v }))}
          placeholder="The overarching story, main conflicts and themes…" minHeight="110px" maxLength={limitFor('campaigns', 'plot_summary')} />
      </div>
      <div className="set-field">
        <span className="set-label">House notes</span>
        <span className="set-help">House rules, tone, lines and veils, and anything else this table has agreed on.</span>
        <SlashField value={form.worldInfo} onChange={v => setForm(f => ({ ...f, worldInfo: v }))}
          placeholder="Flanking gives advantage. No PvP. Potions are a bonus action…" minHeight="90px" maxLength={limitFor('campaigns', 'world_info')} />
      </div>
    </>
  );
}

const STATUSES: { id: WorldCampaign['status']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

const EDITIONS: RulesEdition[] = ['2014', '2024'];
const LEVELLING: { id: Levelling; label: string }[] = [
  { id: 'xp', label: 'By XP' },
  { id: 'milestone', label: 'By milestone' },
];

export default function SettingsView() {
  const { selectedCampaign, updateCampaign: updateCampaignRow } = useCampaign();
  const { campaigns, updateCampaign } = useWorld();
  const toast = useToast();
  const worldCampaign = campaigns.find(c => c.id === selectedCampaign?.id) ?? null;

  const setRules = (patch: { rules_edition?: RulesEdition; levelling?: Levelling }) => {
    if (!selectedCampaign) return;
    updateCampaignRow(selectedCampaign.id, patch)
      .catch(e => toast(e instanceof Error ? e.message : 'Couldn’t save the rules.', 'error'));
  };

  const setStatus = (status: WorldCampaign['status']) => {
    if (!worldCampaign) return;
    updateCampaign(worldCampaign.id, { status })
      .catch(e => toast(e instanceof Error ? e.message : 'Couldn’t change the status.', 'error'));
  };

  // The name lives on the campaign and in the world's list; the old separate
  // title follows it so the two never disagree.
  const rename = async (name: string) => {
    if (!selectedCampaign) return;
    try {
      await Promise.all([
        updateCampaign(selectedCampaign.id, { name }),
        updateCampaignRow(selectedCampaign.id, { name, title: name }),
      ]);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t rename the campaign.', 'error');
    }
  };

  const setArchived = (archived: boolean) => {
    if (!worldCampaign) return;
    updateCampaign(worldCampaign.id, { archived })
      .then(() => toast(archived ? 'Archived. It’s off the world’s lists; restore it here any time.' : 'Restored to the world’s lists.', 'success'))
      .catch(e => toast(e instanceof Error ? e.message : 'Couldn’t archive the campaign.', 'error'));
  };

  return (
    <div className="cm-md cm-md-single">
      <div className="cm-md-detail">
        <div className="cm-detail">
          <div className="cm-detail-head">
            <div className="cm-detail-eyebrow">Settings</div>
            <h1 className="cm-detail-title">Campaign Settings</h1>
          </div>
          <div className="cm-detail-body">
            {/* Campaign info */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Campaign</span>
                <span className="cm-section-rule" />
              </div>
              {selectedCampaign && (
                <SettingRow label="Name" help="What the campaign is called everywhere: Home, the sidebar and exports.">
                  <NameField key={selectedCampaign.id + selectedCampaign.name} name={selectedCampaign.name} onSave={rename} />
                </SettingRow>
              )}
              {worldCampaign && (
                <SettingRow
                  label="Status"
                  help={worldCampaign.archived
                    ? 'Archived: it’s off the world’s lists, and nothing in it is deleted. Restore it to bring it back.'
                    : 'Shown on the campaign’s card in the world sidebar. Archive it to take it off the world’s lists without deleting anything.'}
                >
                  <div className="set-status">
                    {!worldCampaign.archived && (
                      <div className="flex gap-1" role="radiogroup" aria-label="Campaign status">
                        {STATUSES.map(st => (
                          <TogglePill key={st.id} active={worldCampaign.status === st.id} onClick={() => setStatus(st.id)}>
                            {st.label}
                          </TogglePill>
                        ))}
                      </div>
                    )}
                    <Button size="xs" variant="secondary" onClick={() => setArchived(!worldCampaign.archived)}>
                      {worldCampaign.archived ? 'Restore' : 'Archive'}
                    </Button>
                  </div>
                </SettingRow>
              )}
              {selectedCampaign && <CampaignNotes key={selectedCampaign.id} />}
            </section>

            {/* Rules: which edition rates encounters, and how the party levels */}
            {selectedCampaign && (
              <section className="cm-section">
                <div className="cm-section-head">
                  <span className="cm-section-rule" />
                  <span className="cm-section-title">Rules</span>
                  <span className="cm-section-rule" />
                </div>
                <SettingRow
                  label="Edition"
                  help="Encounter difficulty follows it: the 2014 thresholds and multipliers, or the 2024 XP budget (Low, Moderate, High)."
                >
                  <div className="flex gap-1" role="radiogroup" aria-label="Rules edition">
                    {EDITIONS.map(ed => (
                      <TogglePill key={ed} active={(selectedCampaign.rules_edition ?? '2014') === ed} onClick={() => setRules({ rules_edition: ed })}>
                        {ed} rules
                      </TogglePill>
                    ))}
                  </div>
                </SettingRow>
                <SettingRow
                  label="Levelling"
                  help="What the end-of-session wrap-up asks: XP from the night's fights, or a level at a milestone."
                >
                  <div className="flex gap-1" role="radiogroup" aria-label="Levelling">
                    {LEVELLING.map(l => (
                      <TogglePill key={l.id} active={selectedCampaign.levelling === l.id} onClick={() => setRules({ levelling: l.id })}>
                        {l.label}
                      </TogglePill>
                    ))}
                  </div>
                </SettingRow>
              </section>
            )}

            {/* Backup */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Backup</span>
                <span className="cm-section-rule" />
              </div>
              <ExportCampaignPanel />
            </section>

            {/* Discord */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Discord</span>
                <span className="cm-section-rule" />
              </div>
              <DiscordBotSettings />
            </section>

            {/* Account */}
            <section className="cm-section">
              <div className="cm-section-head">
                <span className="cm-section-rule" />
                <span className="cm-section-title">Account</span>
                <span className="cm-section-rule" />
              </div>
              <div style={{ paddingTop: '8px' }}>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={signOut}
                  style={{ color: 'var(--red)' }}
                >
                  Log out
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
