import { useCampaign } from '../../context/CampaignContext';
import { useWorld } from '../../context/WorldContext';
import { useToast } from '../../context/ToastContext';
import type { WorldCampaign } from '../../types/world';
import { signOut } from '../../lib/auth';
import { Button } from '../ui/Button';
import { DiscordBotSettings } from '../session/DiscordBotSettings';

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

const STATUSES: { id: WorldCampaign['status']; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'paused', label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

export default function SettingsView() {
  const { selectedCampaign } = useCampaign();
  const { campaigns, updateCampaign } = useWorld();
  const toast = useToast();
  const worldCampaign = campaigns.find(c => c.id === selectedCampaign?.id) ?? null;

  const setStatus = (status: WorldCampaign['status']) => {
    if (!worldCampaign) return;
    updateCampaign(worldCampaign.id, { status })
      .catch(e => toast(e instanceof Error ? e.message : 'Couldn’t change the status.', 'error'));
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
                <div style={{ padding: '8px 0', color: 'var(--ink-2)', fontSize: '14px' }}>
                  <strong>{selectedCampaign.name}</strong>
                </div>
              )}
              {worldCampaign && (
                <SettingRow
                  label="Status"
                  help="Shown on the campaign's card in the world sidebar."
                >
                  <div className="flex gap-1" role="radiogroup" aria-label="Campaign status">
                    {STATUSES.map(st => (
                      <TogglePill key={st.id} active={worldCampaign.status === st.id} onClick={() => setStatus(st.id)}>
                        {st.label}
                      </TogglePill>
                    ))}
                  </div>
                </SettingRow>
              )}
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
                  Sign out
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
